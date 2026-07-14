/**
 * SemanticGraphBuilder — the full "compile" pass: DSL document → Semantic Graph.
 *
 * Reads the immutable {@link DiagramDocument}, classifies every node/edge, resolves
 * tags and containment, and assembles an indexed, immutable {@link SemanticGraph}.
 * Pure and deterministic: the same document always yields an equivalent graph.
 */

import type {
  DiagramDocument,
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  Metadata,
  MetadataValue,
} from '@/dsl';
import type { SemanticEntity, SemanticPort } from '../model/entity';
import { categoryOf } from '../model/entity';
import type { SemanticRelationship } from '../model/relationship';
import type { SemanticGroup, GroupKind } from '../model/group';
import type { GraphStats, SemanticGraph } from '../model/graph';
import { inferEntityKind, inferRelationshipKind } from './classify';
import { GraphIndex } from './GraphIndex';

/** Metadata keys the engine consumes internally — hidden from `attributes`. */
const INTERNAL_META_KEYS: ReadonlySet<string> = new Set([
  'role',
  'relType',
  'semanticRelation',
  'description',
]);

function attributesOf(metadata: Metadata): Readonly<Record<string, MetadataValue>> {
  const out: Record<string, MetadataValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!INTERNAL_META_KEYS.has(key)) out[key] = value;
  }
  return out;
}

function descriptionOf(metadata: Metadata): string | undefined {
  const d = metadata['description'];
  return typeof d === 'string' && d.trim().length > 0 ? d : undefined;
}

/** Human label for a node: explicit label → text content → id fallback. */
function labelOfNode(node: DiagramNode): string {
  if (node.label && node.label.text.trim().length > 0) return node.label.text;
  if (node.type === 'text' && node.text.trim().length > 0) return node.text;
  return node.id;
}

function resolveTags(tagIds: readonly string[] | undefined, doc: DiagramDocument): readonly string[] {
  if (!tagIds || tagIds.length === 0) return [];
  const out: string[] = [];
  for (const id of tagIds) {
    const tag = doc.tags[id];
    if (tag) out.push(tag.label);
  }
  return out;
}

/**
 * Reverse index of node → owning group id. In the DSL, membership lives on the
 * group's `childIds` (and container nodes' `childIds`), not on the node — so we
 * invert it once. Container membership takes precedence when a node is in both.
 */
export function buildNodeGroupIndex(doc: DiagramDocument): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of Object.values(doc.groups) as DiagramGroup[]) {
    for (const childId of group.childIds) if (doc.nodes[childId]) map.set(childId, group.id);
  }
  for (const node of Object.values(doc.nodes) as DiagramNode[]) {
    if (node.type !== 'container') continue;
    for (const childId of node.childIds) if (doc.nodes[childId]) map.set(childId, `container:${node.id}`);
  }
  return map;
}

function buildEntity(
  node: DiagramNode,
  doc: DiagramDocument,
  portsByEntity: ReadonlyMap<string, SemanticPort[]>,
  groupId: string | undefined,
): SemanticEntity {
  const { kind, inferred } = inferEntityKind(node);
  const { width, height } = node.size;
  const { x, y } = node.position;
  const description = descriptionOf(node.metadata);
  const shape = node.type === 'shape' ? node.shape : undefined;
  const role = node.type === 'shape' ? node.semantic : undefined;

  return {
    id: node.id,
    kind,
    category: categoryOf(kind),
    label: labelOfNode(node),
    ...(description ? { description } : {}),
    tags: resolveTags(node.tagIds, doc),
    ...(groupId ? { groupId } : {}),
    ...(node.layerId ? { layerId: node.layerId } : {}),
    attributes: attributesOf(node.metadata),
    ports: portsByEntity.get(node.id) ?? [],
    geometry: {
      x,
      y,
      width,
      height,
      area: width * height,
      cx: x + width / 2,
      cy: y + height / 2,
      z: node.z,
    },
    source: {
      nodeType: node.type,
      ...(shape ? { shape } : {}),
      ...(role ? { role } : {}),
    },
    inferred,
  };
}

function buildRelationship(edge: DiagramEdge, doc: DiagramDocument): SemanticRelationship {
  const { kind, inferred } = inferRelationshipKind(edge);
  const directed = edge.arrowheads.end !== 'none' || edge.arrowheads.start !== 'none';
  return {
    id: edge.id,
    kind,
    source: edge.source.nodeId,
    target: edge.target.nodeId,
    ...(edge.label && edge.label.text.trim().length > 0 ? { label: edge.label.text } : {}),
    directed,
    tags: resolveTags(edge.tagIds, doc),
    ...(edge.source.port ? { sourcePort: edge.source.port } : {}),
    ...(edge.target.port ? { targetPort: edge.target.port } : {}),
    attributes: attributesOf(edge.metadata),
    inferred,
  };
}

/** Derive the ports each entity participates in from edge endpoints. */
function buildPorts(edges: readonly DiagramEdge[]): Map<string, SemanticPort[]> {
  // entityId → (portKey → { anchor, relIds })
  const byEntity = new Map<string, Map<string, { anchor?: string; relIds: string[] }>>();
  const record = (entityId: string, portId: string | undefined, anchor: string | undefined, relId: string) => {
    if (!portId && !anchor) return;
    const key = portId ?? `anchor:${anchor}`;
    let ports = byEntity.get(entityId);
    if (!ports) {
      ports = new Map();
      byEntity.set(entityId, ports);
    }
    const existing = ports.get(key);
    if (existing) existing.relIds.push(relId);
    else ports.set(key, { ...(anchor ? { anchor } : {}), relIds: [relId] });
  };

  for (const edge of edges) {
    record(edge.source.nodeId, edge.source.port, edge.source.anchor, edge.id);
    record(edge.target.nodeId, edge.target.port, edge.target.anchor, edge.id);
  }

  const out = new Map<string, SemanticPort[]>();
  for (const [entityId, ports] of byEntity) {
    out.set(
      entityId,
      [...ports].map(([id, { anchor, relIds }]) => ({ id, ...(anchor ? { anchor } : {}), relationshipIds: relIds })),
    );
  }
  return out;
}

function buildGroups(doc: DiagramDocument): Map<string, SemanticGroup> {
  const groups = new Map<string, SemanticGroup>();

  // DSL groups: split children into entity members vs nested groups.
  const parentOfGroup = new Map<string, string>();
  for (const group of Object.values(doc.groups) as DiagramGroup[]) {
    const memberIds: string[] = [];
    const childGroupIds: string[] = [];
    for (const childId of group.childIds) {
      if (doc.groups[childId]) {
        childGroupIds.push(childId);
        parentOfGroup.set(childId, group.id);
      } else if (doc.nodes[childId]) {
        memberIds.push(childId);
      }
    }
    groups.set(group.id, {
      id: group.id,
      kind: group.kind as GroupKind,
      label: group.name ?? group.id,
      memberIds,
      childGroupIds,
      attributes: attributesOf(group.metadata),
      synthetic: false,
    });
  }
  // Second pass wires parent back-links now that all groups exist.
  for (const [childId, parentId] of parentOfGroup) {
    const child = groups.get(childId);
    if (child) groups.set(childId, { ...child, parentGroupId: parentId });
  }

  // Container nodes become synthetic containment groups.
  for (const node of Object.values(doc.nodes) as DiagramNode[]) {
    if (node.type !== 'container') continue;
    const memberIds = node.childIds.filter((id) => doc.nodes[id]);
    if (memberIds.length === 0) continue;
    const id = `container:${node.id}`;
    groups.set(id, {
      id,
      kind: 'container',
      label: labelOfNode(node),
      memberIds,
      childGroupIds: [],
      attributes: {},
      synthetic: true,
    });
  }

  return groups;
}

function computeStats(
  entities: ReadonlyMap<string, SemanticEntity>,
  relationshipCount: number,
  groupCount: number,
  index: GraphIndex,
): GraphStats {
  const ids = [...entities.keys()];

  // Weakly-connected components + isolation via union-find over undirected adjacency.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) parent.set(id, id);
  for (const id of ids) {
    for (const succ of index.successors(id)) union(id, succ);
  }
  const roots = new Set<string>();
  let isolatedCount = 0;
  let maxDegree = 0;
  let densestEntityId: string | undefined;
  for (const id of ids) {
    roots.add(find(id));
    const degree = index.degree(id);
    if (degree === 0) isolatedCount++;
    if (degree > maxDegree) {
      maxDegree = degree;
      densestEntityId = id;
    }
  }

  return {
    entityCount: entities.size,
    relationshipCount,
    groupCount,
    componentCount: ids.length === 0 ? 0 : roots.size,
    isolatedCount,
    maxDegree,
    ...(densestEntityId ? { densestEntityId } : {}),
    hasCycles: detectCycle(ids, index),
  };
}

/** Directed cycle detection via iterative DFS colouring (white/grey/black). */
function detectCycle(ids: readonly string[], index: GraphIndex): boolean {
  const color = new Map<string, 0 | 1 | 2>();
  for (const id of ids) color.set(id, 0);
  const stack: Array<{ id: string; iter: Iterator<string> }> = [];
  for (const start of ids) {
    if (color.get(start) !== 0) continue;
    color.set(start, 1);
    stack.push({ id: start, iter: index.successors(start)[Symbol.iterator]() });
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.iter.next();
      if (next.done) {
        color.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const child = next.value;
      const c = color.get(child) ?? 0;
      if (c === 1) return true; // back-edge → cycle
      if (c === 0) {
        color.set(child, 1);
        stack.push({ id: child, iter: index.successors(child)[Symbol.iterator]() });
      }
    }
  }
  return false;
}

/** Assemble a graph snapshot from prebuilt semantic maps (shared by full + incremental builds). */
export function assembleGraph(
  documentId: string,
  version: number,
  entities: Map<string, SemanticEntity>,
  relationships: Map<string, SemanticRelationship>,
  groups: Map<string, SemanticGroup>,
): SemanticGraph {
  const index = GraphIndex.build(entities, relationships, groups);
  const stats = computeStats(entities, relationships.size, groups.size, index);
  return { documentId, version, entities, relationships, groups, index, stats };
}

/** Full build: DSL document → Semantic Graph. */
export function buildSemanticGraph(doc: DiagramDocument, version = 0): SemanticGraph {
  const edges = Object.values(doc.edges) as DiagramEdge[];
  const portsByEntity = buildPorts(edges);
  const groupOf = buildNodeGroupIndex(doc);

  const entities = new Map<string, SemanticEntity>();
  for (const node of Object.values(doc.nodes) as DiagramNode[]) {
    entities.set(node.id, buildEntity(node, doc, portsByEntity, groupOf.get(node.id)));
  }

  const relationships = new Map<string, SemanticRelationship>();
  for (const edge of edges) {
    relationships.set(edge.id, buildRelationship(edge, doc));
  }

  const groups = buildGroups(doc);
  return assembleGraph(doc.id, version, entities, relationships, groups);
}

// Re-exported internals for incremental reuse.
export { buildEntity, buildRelationship, buildPorts, buildGroups };
