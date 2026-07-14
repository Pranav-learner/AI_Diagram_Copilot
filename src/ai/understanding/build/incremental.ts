/**
 * Incremental compilation — apply a document change to an existing Semantic Graph
 * without reclassifying the parts that did not move.
 *
 * The DSL is immutable with structural sharing: an operation produces a new
 * document in which only the touched entities are *new objects*; everything else
 * is referentially identical to before. We exploit that to diff by identity
 * (`prev[id] !== next[id]`) in O(V+E) and rebuild the semantic representation only
 * for entities/relationships/groups that actually changed — the expensive
 * classification pass runs on the delta, not the whole diagram. The lightweight
 * {@link GraphIndex} is always rebuilt fresh (cheap map ops); this is the
 * deliberate trade documented in the README.
 *
 * The returned {@link ChangedIds} drives region-aware cache invalidation upstream.
 */

import type { DiagramDocument, DiagramEdge, DiagramNode } from '@/dsl';
import type { SemanticEntity } from '../model/entity';
import type { SemanticRelationship } from '../model/relationship';
import type { SemanticGroup } from '../model/group';
import type { SemanticGraph } from '../model/graph';
import {
  assembleGraph,
  buildEntity,
  buildGroups,
  buildNodeGroupIndex,
  buildPorts,
  buildRelationship,
  buildSemanticGraph,
} from './SemanticGraphBuilder';

export interface ChangedIds {
  readonly entities: ReadonlySet<string>;
  readonly relationships: ReadonlySet<string>;
  readonly groups: ReadonlySet<string>;
  /** Union of all touched ids — the invalidation key set for caches. */
  readonly all: ReadonlySet<string>;
}

export interface GraphDelta {
  readonly graph: SemanticGraph;
  readonly changed: ChangedIds;
  /** True when we fell back to a full rebuild (no usable previous document). */
  readonly rebuiltFull: boolean;
}

function keysOf(record: Readonly<Record<string, unknown>>): Set<string> {
  return new Set(Object.keys(record));
}

/** Ids present in `next` that are new or whose object identity changed vs `prev`. */
function changedKeys<T>(prev: Readonly<Record<string, T>>, next: Readonly<Record<string, T>>): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(next)) {
    if (prev[id] !== next[id]) out.add(id);
  }
  return out;
}

/** Ids present in `prev` but gone from `next`. */
function removedKeys<T>(prev: Readonly<Record<string, T>>, next: Readonly<Record<string, T>>): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(prev)) {
    if (!(id in next)) out.add(id);
  }
  return out;
}

function groupsDiffer(a: SemanticGroup | undefined, b: SemanticGroup | undefined): boolean {
  if (!a || !b) return a !== b;
  if (a.label !== b.label || a.kind !== b.kind || a.parentGroupId !== b.parentGroupId) return true;
  if (a.memberIds.length !== b.memberIds.length || a.childGroupIds.length !== b.childGroupIds.length) return true;
  for (let i = 0; i < a.memberIds.length; i++) if (a.memberIds[i] !== b.memberIds[i]) return true;
  for (let i = 0; i < a.childGroupIds.length; i++) if (a.childGroupIds[i] !== b.childGroupIds[i]) return true;
  return false;
}

/**
 * Recompute the Semantic Graph for `next`, reusing everything unchanged since
 * `prev`. `prevDoc` must be the document `prevGraph` was built from.
 */
export function incrementalUpdate(
  prevGraph: SemanticGraph,
  prevDoc: DiagramDocument,
  next: DiagramDocument,
  version: number,
): GraphDelta {
  // ── Edges → relationships, and the entities whose ports they touch ──────────
  const changedEdgeIds = changedKeys(prevDoc.edges, next.edges);
  const removedEdgeIds = removedKeys(prevDoc.edges, next.edges);

  const portAffected = new Set<string>();
  const touchEndpoints = (edge: DiagramEdge | undefined) => {
    if (!edge) return;
    portAffected.add(edge.source.nodeId);
    portAffected.add(edge.target.nodeId);
  };
  for (const id of changedEdgeIds) touchEndpoints(next.edges[id]);
  for (const id of changedEdgeIds) touchEndpoints(prevDoc.edges[id]);
  for (const id of removedEdgeIds) touchEndpoints(prevDoc.edges[id]);

  // ── Tags: a changed tag object relabels every entity/edge that references it ──
  const changedTagIds = new Set<string>([
    ...changedKeys(prevDoc.tags, next.tags),
    ...removedKeys(prevDoc.tags, next.tags),
  ]);
  const referencesChangedTag = (tagIds: readonly string[] | undefined): boolean =>
    !!tagIds && tagIds.some((t) => changedTagIds.has(t));

  // ── Entities ─────────────────────────────────────────────────────────────
  const changedNodeIds = changedKeys(prevDoc.nodes, next.nodes);
  const removedNodeIds = removedKeys(prevDoc.nodes, next.nodes);
  const portsByEntity = buildPorts(Object.values(next.edges) as DiagramEdge[]);
  // Group membership lives on groups, not nodes — so a node's owning group can
  // change while the node object is untouched. Diff the reverse index to catch it.
  const prevGroupOf = buildNodeGroupIndex(prevDoc);
  const nextGroupOf = buildNodeGroupIndex(next);

  const entities = new Map<string, SemanticEntity>();
  const changedEntityIds = new Set<string>(removedNodeIds);
  for (const node of Object.values(next.nodes) as DiagramNode[]) {
    const mustRebuild =
      changedNodeIds.has(node.id) ||
      portAffected.has(node.id) ||
      referencesChangedTag(node.tagIds) ||
      nextGroupOf.get(node.id) !== prevGroupOf.get(node.id) ||
      !prevGraph.entities.has(node.id);
    if (mustRebuild) {
      entities.set(node.id, buildEntity(node, next, portsByEntity, nextGroupOf.get(node.id)));
      changedEntityIds.add(node.id);
    } else {
      entities.set(node.id, prevGraph.entities.get(node.id)!);
    }
  }

  // ── Relationships ──────────────────────────────────────────────────────────
  const relationships = new Map<string, SemanticRelationship>();
  const changedRelIds = new Set<string>(removedEdgeIds);
  for (const edge of Object.values(next.edges) as DiagramEdge[]) {
    const mustRebuild =
      changedEdgeIds.has(edge.id) || referencesChangedTag(edge.tagIds) || !prevGraph.relationships.has(edge.id);
    if (mustRebuild) {
      relationships.set(edge.id, buildRelationship(edge, next));
      changedRelIds.add(edge.id);
    } else {
      relationships.set(edge.id, prevGraph.relationships.get(edge.id)!);
    }
  }

  // ── Groups ─────────────────────────────────────────────────────────────────
  // Groups derive from both the groups map and container nodes; when either axis
  // moves we rebuild the (few) groups wholesale and diff to find what changed.
  const groupTopologyChanged =
    changedKeys(prevDoc.groups, next.groups).size > 0 ||
    removedKeys(prevDoc.groups, next.groups).size > 0 ||
    [...changedNodeIds, ...removedNodeIds].some(
      (id) => next.nodes[id]?.type === 'container' || prevDoc.nodes[id]?.type === 'container',
    );

  let groups: Map<string, SemanticGroup>;
  const changedGroupIds = new Set<string>();
  if (groupTopologyChanged) {
    groups = buildGroups(next);
    const allGroupIds = new Set<string>([...prevGraph.groups.keys(), ...groups.keys()]);
    for (const id of allGroupIds) {
      if (groupsDiffer(prevGraph.groups.get(id), groups.get(id))) changedGroupIds.add(id);
    }
  } else {
    groups = new Map(prevGraph.groups);
  }

  const graph = assembleGraph(next.id, version, entities, relationships, groups);
  const all = new Set<string>([...changedEntityIds, ...changedRelIds, ...changedGroupIds]);
  return {
    graph,
    changed: { entities: changedEntityIds, relationships: changedRelIds, groups: changedGroupIds, all },
    rebuiltFull: false,
  };
}

/** Full rebuild wrapped in the {@link GraphDelta} shape (all ids reported changed). */
export function fullRebuild(next: DiagramDocument, version: number): GraphDelta {
  const graph = buildSemanticGraph(next, version);
  const all = new Set<string>([...graph.entities.keys(), ...graph.relationships.keys(), ...graph.groups.keys()]);
  return {
    graph,
    changed: {
      entities: new Set(graph.entities.keys()),
      relationships: new Set(graph.relationships.keys()),
      groups: new Set(graph.groups.keys()),
      all,
    },
    rebuiltFull: true,
  };
}

// Small helper kept internal but exported for tests.
export { keysOf };
