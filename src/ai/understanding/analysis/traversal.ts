/**
 * Graph traversal — BFS/DFS over the relationship graph of a {@link SemanticGraph}.
 *
 * These are the primitives every higher-level analysis (paths, reachability,
 * neighbourhood, dependency chains) is built from. They walk the precomputed
 * adjacency in {@link GraphIndex}, so a traversal costs O(V + E) touched, never a
 * full-graph scan. Direction is first-class: relationships are directed, so
 * callers choose whether to follow them forwards (`out`), backwards (`in`), or
 * ignore direction (`both`).
 */

import type { SemanticGraph } from '../model/graph';

/** Which way to follow directed relationships during a walk. */
export type Direction = 'out' | 'in' | 'both';

export interface TraversalOptions {
  /** Direction to follow relationships. Default `out`. */
  readonly direction?: Direction;
  /** Stop expanding beyond this hop distance from the start (inclusive). */
  readonly maxDepth?: number;
  /** If set, only traverse relationships whose kind is in this set. */
  readonly relKinds?: ReadonlySet<string>;
  /** If set, never expand *into* these entity ids (they still appear if reached). */
  readonly blocked?: ReadonlySet<string>;
  /** Include the start node in {@link TraversalResult.order}. Default true. */
  readonly includeStart?: boolean;
}

export interface TraversalResult {
  /** Entity ids in visitation order. */
  readonly order: readonly string[];
  /** Hop distance from the start for every visited entity. */
  readonly depth: ReadonlyMap<string, number>;
  /** Predecessor on the discovery tree (`null` for the start). */
  readonly parent: ReadonlyMap<string, string | null>;
}

/**
 * Resolve the next entity ids to expand from `id`, honouring direction and any
 * relationship-kind filter. When a `relKinds` filter is present we must inspect
 * the relationships themselves (not the cached successor/predecessor sets), since
 * those sets collapse across kinds.
 */
export function step(graph: SemanticGraph, id: string, opts: TraversalOptions): string[] {
  const direction = opts.direction ?? 'out';
  const { relKinds } = opts;

  if (!relKinds) {
    if (direction === 'out') return [...graph.index.successors(id)];
    if (direction === 'in') return [...graph.index.predecessors(id)];
    return [...graph.index.neighbors(id)];
  }

  const out = new Set<string>();
  const consider = (relId: string, endpoint: 'source' | 'target') => {
    const rel = graph.relationships.get(relId);
    if (!rel || !relKinds.has(rel.kind)) return;
    out.add(endpoint === 'target' ? rel.target : rel.source);
  };
  if (direction === 'out' || direction === 'both') {
    for (const relId of graph.index.outgoing(id)) consider(relId, 'target');
  }
  if (direction === 'in' || direction === 'both') {
    for (const relId of graph.index.incoming(id)) consider(relId, 'source');
  }
  out.delete(id);
  return [...out];
}

/** Breadth-first traversal from one or more start entities. */
export function bfs(
  graph: SemanticGraph,
  start: string | readonly string[],
  opts: TraversalOptions = {},
): TraversalResult {
  const starts = typeof start === 'string' ? [start] : start;
  const includeStart = opts.includeStart ?? true;
  const maxDepth = opts.maxDepth ?? Infinity;
  const blocked = opts.blocked;

  const depth = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const order: string[] = [];
  const queue: string[] = [];

  for (const s of starts) {
    if (!graph.entities.has(s) || depth.has(s)) continue;
    depth.set(s, 0);
    parent.set(s, null);
    queue.push(s);
    if (includeStart) order.push(s);
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const d = depth.get(id)!;
    if (d >= maxDepth) continue;
    if (blocked?.has(id)) continue;
    for (const next of step(graph, id, opts)) {
      if (depth.has(next) || !graph.entities.has(next)) continue;
      depth.set(next, d + 1);
      parent.set(next, id);
      order.push(next);
      queue.push(next);
    }
  }

  return { order, depth, parent };
}

/** Depth-first traversal (iterative) from one or more start entities. */
export function dfs(
  graph: SemanticGraph,
  start: string | readonly string[],
  opts: TraversalOptions = {},
): TraversalResult {
  const starts = typeof start === 'string' ? [start] : start;
  const includeStart = opts.includeStart ?? true;
  const maxDepth = opts.maxDepth ?? Infinity;
  const blocked = opts.blocked;

  const depth = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const order: string[] = [];
  const visited = new Set<string>();
  const stack: Array<{ id: string; from: string | null; d: number }> = [];

  for (let i = starts.length - 1; i >= 0; i--) {
    const s = starts[i]!;
    if (graph.entities.has(s)) stack.push({ id: s, from: null, d: 0 });
  }

  while (stack.length > 0) {
    const { id, from, d } = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    depth.set(id, d);
    parent.set(id, from);
    if (from !== null || includeStart) order.push(id);
    if (d >= maxDepth || blocked?.has(id)) continue;
    const nexts = step(graph, id, opts);
    for (let i = nexts.length - 1; i >= 0; i--) {
      const next = nexts[i]!;
      if (!visited.has(next) && graph.entities.has(next)) {
        stack.push({ id: next, from: id, d: d + 1 });
      }
    }
  }

  return { order, depth, parent };
}

/**
 * The set of entities reachable from `start` (excluding the start itself unless
 * it is reachable via a cycle). Thin wrapper over {@link bfs}.
 */
export function reachable(
  graph: SemanticGraph,
  start: string | readonly string[],
  opts: TraversalOptions = {},
): Set<string> {
  const result = bfs(graph, start, { ...opts, includeStart: false });
  return new Set(result.order);
}

/**
 * The k-hop neighbourhood of `center` — every entity within `radius` relationship
 * hops (default 1), following relationships in `both` directions by default so the
 * neighbourhood reflects "everything related to X", not just downstream of it.
 * Includes the center.
 */
export function neighborhood(
  graph: SemanticGraph,
  center: string,
  radius = 1,
  opts: TraversalOptions = {},
): Set<string> {
  const result = bfs(graph, center, {
    direction: 'both',
    ...opts,
    maxDepth: radius,
    includeStart: true,
  });
  return new Set(result.order);
}
