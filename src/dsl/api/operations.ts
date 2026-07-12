/**
 * Pure, immutable operations over a {@link DiagramDocument}.
 *
 * Every function returns a *new* document (structural sharing) and never mutates
 * its input — the functional core beneath the {@link DiagramModel} facade.
 * Referential integrity is maintained here: e.g. `removeNode` also drops edges,
 * group memberships, container children, and annotations/comments that pointed
 * at the removed node, so the document never dangles after a mutation.
 */

import type { Clock } from '../primitives/scalars';
import type {
  NodeId,
  EdgeId,
  GroupId,
  LayerId,
  StyleId,
  TagId,
  AnnotationId,
  CommentId,
} from '../primitives/ids';
import type { Metadata, MetadataValue } from '../core/metadata';
import { setMeta } from '../core/metadata';
import { touch } from '../core/entity';
import type {
  DiagramNode,
  ContainerNode,
  ShapeKind,
  SemanticType,
  NodeLabel,
} from '../model/node';
import type { DiagramEdge, Endpoint, RoutingKind, Arrowheads, EdgeLabel } from '../model/edge';
import type { DiagramGroup, GroupChildId } from '../model/group';
import type { Layer } from '../model/layer';
import type { NamedStyle, Style } from '../model/style';
import type { DiagramTag } from '../model/tag';
import type { Annotation } from '../model/annotation';
import type { DiagramComment } from '../model/comment';
import type { Viewport } from '../model/viewport';
import type { DiagramDocument, EntityMap } from '../model/document';

// ── Internal immutable map helpers ──────────────────────────────────────────

function setIn<T>(map: EntityMap<T>, id: string, value: T): EntityMap<T> {
  return { ...map, [id]: value };
}

function removeIn<T>(map: EntityMap<T>, id: string): EntityMap<T> {
  if (!(id in map)) return map;
  const { [id]: _removed, ...rest } = map;
  return rest;
}

/** Drop `undefined`-valued keys so patches never clobber fields with `undefined`. */
function compact<T extends object>(patch: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/** Bump the document's `updatedAt` — every mutation reflects a document change. */
function bumpDoc(doc: DiagramDocument, clock: Clock): DiagramDocument {
  return { ...doc, updatedAt: clock.now() };
}

// ── Nodes ───────────────────────────────────────────────────────────────────

export function addNode(doc: DiagramDocument, node: DiagramNode, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, nodes: setIn(doc.nodes, node.id, node) }, clock);
}

/** A flat, all-optional patch covering every node field except identity/type. */
export interface NodePatch {
  readonly position?: DiagramNode['position'];
  readonly size?: DiagramNode['size'];
  readonly rotation?: number;
  readonly z?: number;
  readonly label?: NodeLabel;
  readonly style?: Style;
  readonly styleRef?: StyleId;
  readonly groupId?: GroupId;
  readonly layerId?: LayerId;
  readonly tagIds?: readonly TagId[];
  readonly locked?: boolean;
  readonly metadata?: Metadata;
  readonly shape?: ShapeKind;
  readonly semantic?: SemanticType;
  readonly text?: string;
  readonly src?: string;
  readonly alt?: string;
  readonly icon?: string;
  readonly childIds?: readonly NodeId[];
}

export function updateNode(
  doc: DiagramDocument,
  id: NodeId,
  patch: NodePatch,
  clock: Clock,
): DiagramDocument {
  const existing = doc.nodes[id];
  if (!existing) return doc;
  // `type` and identity fields are preserved; only known node fields are merged.
  const merged = touch({ ...existing, ...compact(patch) } as DiagramNode, clock);
  return bumpDoc({ ...doc, nodes: setIn(doc.nodes, id, merged) }, clock);
}

/**
 * Remove a node and everything that referenced it: incident edges, its slot in
 * any group/container, and annotations/comments targeting it.
 */
export function removeNode(doc: DiagramDocument, id: NodeId, clock: Clock): DiagramDocument {
  if (!(id in doc.nodes)) return doc;

  const nodes = removeIn(doc.nodes, id);

  // Drop incident edges.
  const edges: Record<string, DiagramEdge> = {};
  for (const [edgeId, edge] of Object.entries(doc.edges)) {
    if (edge.source.nodeId !== id && edge.target.nodeId !== id) edges[edgeId] = edge;
  }

  // Remove from group memberships.
  const groups = mapValues(doc.groups, (g) =>
    g.childIds.includes(id)
      ? { ...g, childIds: g.childIds.filter((c) => c !== id) }
      : g,
  );

  // Remove from container children.
  const cleanedNodes = mapValues(nodes, (n) =>
    n.type === 'container' && n.childIds.includes(id)
      ? ({ ...n, childIds: n.childIds.filter((c) => c !== id) } as ContainerNode)
      : n,
  );

  const annotations = filterValues(
    doc.annotations,
    (a) => !(a.target.kind === 'node' && a.target.nodeId === id),
  );
  const comments = filterValues(
    doc.comments,
    (c) => !(c.target.kind === 'node' && c.target.nodeId === id),
  );

  return bumpDoc(
    { ...doc, nodes: cleanedNodes, edges, groups, annotations, comments },
    clock,
  );
}

export function findNode(doc: DiagramDocument, id: NodeId): DiagramNode | undefined {
  return doc.nodes[id];
}

// ── Edges ─────────────────────────────────────────────────────────────────

export function addEdge(doc: DiagramDocument, edge: DiagramEdge, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, edges: setIn(doc.edges, edge.id, edge) }, clock);
}

export interface EdgePatch {
  readonly source?: Endpoint;
  readonly target?: Endpoint;
  readonly routing?: RoutingKind;
  readonly waypoints?: DiagramEdge['waypoints'];
  readonly arrowheads?: Arrowheads;
  readonly label?: EdgeLabel;
  readonly style?: Style;
  readonly styleRef?: StyleId;
  readonly layerId?: LayerId;
  readonly tagIds?: readonly TagId[];
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

export function updateEdge(
  doc: DiagramDocument,
  id: EdgeId,
  patch: EdgePatch,
  clock: Clock,
): DiagramDocument {
  const existing = doc.edges[id];
  if (!existing) return doc;
  const merged = touch({ ...existing, ...compact(patch) } as DiagramEdge, clock);
  return bumpDoc({ ...doc, edges: setIn(doc.edges, id, merged) }, clock);
}

export function removeEdge(doc: DiagramDocument, id: EdgeId, clock: Clock): DiagramDocument {
  if (!(id in doc.edges)) return doc;
  const annotations = filterValues(
    doc.annotations,
    (a) => !(a.target.kind === 'edge' && a.target.edgeId === id),
  );
  const comments = filterValues(
    doc.comments,
    (c) => !(c.target.kind === 'edge' && c.target.edgeId === id),
  );
  return bumpDoc({ ...doc, edges: removeIn(doc.edges, id), annotations, comments }, clock);
}

export function findEdge(doc: DiagramDocument, id: EdgeId): DiagramEdge | undefined {
  return doc.edges[id];
}

// ── Groups ────────────────────────────────────────────────────────────────

export function addGroup(doc: DiagramDocument, group: DiagramGroup, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, groups: setIn(doc.groups, group.id, group) }, clock);
}

/** Remove a group; clears `groupId` on member nodes and unnests from parents. */
export function removeGroup(doc: DiagramDocument, id: GroupId, clock: Clock): DiagramDocument {
  if (!(id in doc.groups)) return doc;
  const groups = mapValues(removeIn(doc.groups, id), (g) =>
    g.childIds.includes(id)
      ? { ...g, childIds: g.childIds.filter((c) => c !== id) }
      : g,
  );
  const nodes = mapValues(doc.nodes, (n) =>
    n.groupId === id ? { ...n, groupId: undefined } : n,
  );
  return bumpDoc({ ...doc, groups, nodes }, clock);
}

export function addToGroup(
  doc: DiagramDocument,
  groupId: GroupId,
  childId: GroupChildId,
  clock: Clock,
): DiagramDocument {
  const group = doc.groups[groupId];
  if (!group || group.childIds.includes(childId)) return doc;
  let next: DiagramDocument = {
    ...doc,
    groups: setIn(doc.groups, groupId, {
      ...group,
      childIds: [...group.childIds, childId],
    }),
  };
  // If the child is a node, record its parent for reverse lookups.
  const childNode = doc.nodes[childId];
  if (childNode) {
    next = { ...next, nodes: setIn(next.nodes, childId, { ...childNode, groupId }) };
  }
  return bumpDoc(next, clock);
}

export function removeFromGroup(
  doc: DiagramDocument,
  groupId: GroupId,
  childId: GroupChildId,
  clock: Clock,
): DiagramDocument {
  const group = doc.groups[groupId];
  if (!group || !group.childIds.includes(childId)) return doc;
  let next: DiagramDocument = {
    ...doc,
    groups: setIn(doc.groups, groupId, {
      ...group,
      childIds: group.childIds.filter((c) => c !== childId),
    }),
  };
  const childNode = doc.nodes[childId];
  if (childNode && childNode.groupId === groupId) {
    next = {
      ...next,
      nodes: setIn(next.nodes, childId, { ...childNode, groupId: undefined }),
    };
  }
  return bumpDoc(next, clock);
}

export function findGroup(doc: DiagramDocument, id: GroupId): DiagramGroup | undefined {
  return doc.groups[id];
}

// ── Layers / styles / tags / annotations / comments ─────────────────────────

export function addLayer(doc: DiagramDocument, layer: Layer, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, layers: setIn(doc.layers, layer.id, layer) }, clock);
}

export function removeLayer(doc: DiagramDocument, id: LayerId, clock: Clock): DiagramDocument {
  if (!(id in doc.layers)) return doc;
  return bumpDoc({ ...doc, layers: removeIn(doc.layers, id) }, clock);
}

export function defineStyle(doc: DiagramDocument, style: NamedStyle, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, styles: setIn(doc.styles, style.id, style) }, clock);
}

export function removeStyle(doc: DiagramDocument, id: StyleId, clock: Clock): DiagramDocument {
  if (!(id in doc.styles)) return doc;
  return bumpDoc({ ...doc, styles: removeIn(doc.styles, id) }, clock);
}

export function addTag(doc: DiagramDocument, tag: DiagramTag, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, tags: setIn(doc.tags, tag.id, tag) }, clock);
}

export function removeTag(doc: DiagramDocument, id: TagId, clock: Clock): DiagramDocument {
  if (!(id in doc.tags)) return doc;
  // Strip the tag from any entity referencing it.
  const nodes = mapValues(doc.nodes, (n) => stripTag(n, id));
  const edges = mapValues(doc.edges, (e) => stripTag(e, id));
  return bumpDoc({ ...doc, tags: removeIn(doc.tags, id), nodes, edges }, clock);
}

export function addAnnotation(
  doc: DiagramDocument,
  annotation: Annotation,
  clock: Clock,
): DiagramDocument {
  return bumpDoc(
    { ...doc, annotations: setIn(doc.annotations, annotation.id, annotation) },
    clock,
  );
}

export function removeAnnotation(doc: DiagramDocument, id: AnnotationId, clock: Clock): DiagramDocument {
  if (!(id in doc.annotations)) return doc;
  return bumpDoc({ ...doc, annotations: removeIn(doc.annotations, id) }, clock);
}

export function addComment(doc: DiagramDocument, comment: DiagramComment, clock: Clock): DiagramDocument {
  return bumpDoc({ ...doc, comments: setIn(doc.comments, comment.id, comment) }, clock);
}

export function removeComment(doc: DiagramDocument, id: CommentId, clock: Clock): DiagramDocument {
  if (!(id in doc.comments)) return doc;
  return bumpDoc({ ...doc, comments: removeIn(doc.comments, id) }, clock);
}

// ── Document-level ──────────────────────────────────────────────────────────

export function setDocumentMetadata(
  doc: DiagramDocument,
  key: string,
  value: MetadataValue,
  clock: Clock,
): DiagramDocument {
  return bumpDoc({ ...doc, metadata: setMeta(doc.metadata, key, value) }, clock);
}

export function setViewport(
  doc: DiagramDocument,
  patch: Partial<Viewport>,
  clock: Clock,
): DiagramDocument {
  return bumpDoc({ ...doc, viewport: { ...doc.viewport, ...compact(patch) } }, clock);
}

// ── Local utilities ──────────────────────────────────────────────────────────

function mapValues<T>(map: EntityMap<T>, fn: (value: T) => T): EntityMap<T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) out[k] = fn(v);
  return out;
}

function filterValues<T>(map: EntityMap<T>, keep: (value: T) => boolean): EntityMap<T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) if (keep(v)) out[k] = v;
  return out;
}

function stripTag<T extends { readonly tagIds?: readonly TagId[] }>(entity: T, tagId: TagId): T {
  if (!entity.tagIds?.includes(tagId)) return entity;
  return { ...entity, tagIds: entity.tagIds.filter((t) => t !== tagId) };
}
