/**
 * Path analysis — shortest paths, simple paths, and dependency chains.
 *
 * Paths are returned as a first-class {@link Path} (the entity ids *and* the
 * relationship ids that connect them) so callers can explain *how* two entities
 * relate, not merely that they do. Shortest path is unweighted BFS (diagram edges
 * carry no cost); dependency chains follow only {@link DEPENDENCY_KINDS} so the
 * result reads as a genuine "A depends on B depends on C" story.
 */

import type { SemanticGraph } from '../model/graph';
import { DEPENDENCY_KINDS } from '../model/relationship';
import type { Direction, TraversalOptions } from './traversal';

export interface Path {
  /** Entity ids from source to target, inclusive. */
  readonly nodes: readonly string[];
  /** Relationship ids connecting consecutive nodes (length = nodes.length - 1). */
  readonly relationships: readonly string[];
  /** Hop count (number of relationships). */
  readonly length: number;
}

/** Pick the relationship id linking `from`→`to` in the requested direction. */
function relationshipBetween(
  graph: SemanticGraph,
  from: string,
  to: string,
  direction: Direction,
  relKinds?: ReadonlySet<string>,
): string | undefined {
  const scan = (relIds: readonly string[], match: (relSource: string, relTarget: string) => boolean) => {
    for (const relId of relIds) {
      const rel = graph.relationships.get(relId);
      if (!rel) continue;
      if (relKinds && !relKinds.has(rel.kind)) continue;
      if (match(rel.source, rel.target)) return relId;
    }
    return undefined;
  };
  if (direction === 'out' || direction === 'both') {
    const hit = scan(graph.index.outgoing(from), (s, t) => s === from && t === to);
    if (hit) return hit;
  }
  if (direction === 'in' || direction === 'both') {
    const hit = scan(graph.index.incoming(from), (s, t) => t === from && s === to);
    if (hit) return hit;
  }
  if (direction === 'both') {
    // outgoing scan above only matched from→to; also catch to→from stored as outgoing of `to`.
    const hit = scan(graph.index.incoming(from), (s, t) => s === to && t === from);
    if (hit) return hit;
  }
  return undefined;
}

/** Reconstruct a {@link Path} from a BFS parent map. */
function buildPath(
  graph: SemanticGraph,
  from: string,
  to: string,
  parent: ReadonlyMap<string, string | null>,
  direction: Direction,
  relKinds?: ReadonlySet<string>,
): Path {
  const nodes: string[] = [];
  let cur: string | null | undefined = to;
  while (cur != null) {
    nodes.push(cur);
    cur = cur === from ? null : parent.get(cur) ?? null;
  }
  nodes.reverse();
  const relationships: string[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const relId = relationshipBetween(graph, nodes[i]!, nodes[i + 1]!, direction, relKinds);
    if (relId) relationships.push(relId);
  }
  return { nodes, relationships, length: nodes.length - 1 };
}

/**
 * Shortest (fewest-hop) path between two entities, or `null` if unreachable.
 * Follows relationships in `direction` (default `out`) with an optional kind filter.
 */
export function shortestPath(
  graph: SemanticGraph,
  from: string,
  to: string,
  opts: Pick<TraversalOptions, 'direction' | 'relKinds'> = {},
): Path | null {
  if (!graph.entities.has(from) || !graph.entities.has(to)) return null;
  const direction = opts.direction ?? 'out';
  if (from === to) return { nodes: [from], relationships: [], length: 0 };

  // Local BFS that records parents (we need the tree to reconstruct the path).
  const parent = new Map<string, string | null>();
  parent.set(from, null);
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    for (const next of neighborsFor(graph, id, direction, opts.relKinds)) {
      if (parent.has(next)) continue;
      parent.set(next, id);
      if (next === to) return buildPath(graph, from, to, parent, direction, opts.relKinds);
      queue.push(next);
    }
  }
  return null;
}

function neighborsFor(
  graph: SemanticGraph,
  id: string,
  direction: Direction,
  relKinds?: ReadonlySet<string>,
): string[] {
  if (!relKinds) {
    if (direction === 'out') return [...graph.index.successors(id)];
    if (direction === 'in') return [...graph.index.predecessors(id)];
    return [...graph.index.neighbors(id)];
  }
  const out = new Set<string>();
  if (direction === 'out' || direction === 'both') {
    for (const relId of graph.index.outgoing(id)) {
      const rel = graph.relationships.get(relId);
      if (rel && relKinds.has(rel.kind)) out.add(rel.target);
    }
  }
  if (direction === 'in' || direction === 'both') {
    for (const relId of graph.index.incoming(id)) {
      const rel = graph.relationships.get(relId);
      if (rel && relKinds.has(rel.kind)) out.add(rel.source);
    }
  }
  out.delete(id);
  return [...out];
}

/**
 * Are `to` reachable from `from` following `direction`? O(V+E) BFS with early exit.
 */
export function isReachable(
  graph: SemanticGraph,
  from: string,
  to: string,
  opts: Pick<TraversalOptions, 'direction' | 'relKinds'> = {},
): boolean {
  return shortestPath(graph, from, to, opts) !== null;
}

/**
 * Every *simple* path (no repeated node) from `from` to `to`, up to `maxPaths`
 * results and `maxDepth` hops. Guarded because the count can be exponential; the
 * caps keep it bounded for interactive/AI use. Ordered shortest-first-ish by DFS.
 */
export function allSimplePaths(
  graph: SemanticGraph,
  from: string,
  to: string,
  opts: { direction?: Direction; relKinds?: ReadonlySet<string>; maxDepth?: number; maxPaths?: number } = {},
): Path[] {
  if (!graph.entities.has(from) || !graph.entities.has(to)) return [];
  const direction = opts.direction ?? 'out';
  const maxDepth = opts.maxDepth ?? 12;
  const maxPaths = opts.maxPaths ?? 32;
  const results: Path[] = [];
  const nodeStack: string[] = [from];
  const onStack = new Set<string>([from]);

  const dfsWalk = (id: string) => {
    if (results.length >= maxPaths) return;
    if (id === to && nodeStack.length > 1) {
      results.push(materialise(graph, nodeStack, direction, opts.relKinds));
      return;
    }
    if (nodeStack.length - 1 >= maxDepth) return;
    for (const next of neighborsFor(graph, id, direction, opts.relKinds)) {
      if (onStack.has(next)) continue;
      nodeStack.push(next);
      onStack.add(next);
      dfsWalk(next);
      nodeStack.pop();
      onStack.delete(next);
      if (results.length >= maxPaths) return;
    }
  };
  dfsWalk(from);
  return results;
}

function materialise(
  graph: SemanticGraph,
  nodes: readonly string[],
  direction: Direction,
  relKinds?: ReadonlySet<string>,
): Path {
  const rels: string[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const relId = relationshipBetween(graph, nodes[i]!, nodes[i + 1]!, direction, relKinds);
    if (relId) rels.push(relId);
  }
  return { nodes: [...nodes], relationships: rels, length: nodes.length - 1 };
}

/**
 * Dependency chains rooted at `id`: the maximal forward walks over
 * {@link DEPENDENCY_KINDS} relationships, i.e. "what this entity (transitively)
 * depends on". Each chain runs until a sink (nothing further depended on) or a
 * cycle/`maxDepth`. Useful for AI Review's impact analysis later.
 */
export function dependencyChains(
  graph: SemanticGraph,
  id: string,
  opts: { direction?: Direction; maxDepth?: number; maxChains?: number } = {},
): string[][] {
  if (!graph.entities.has(id)) return [];
  const direction = opts.direction ?? 'out';
  const maxDepth = opts.maxDepth ?? 24;
  const maxChains = opts.maxChains ?? 64;
  const chains: string[][] = [];
  const path: string[] = [id];
  const onPath = new Set<string>([id]);

  const walk = (cur: string) => {
    if (chains.length >= maxChains) return;
    const nexts = neighborsFor(graph, cur, direction, DEPENDENCY_KINDS).filter((n) => !onPath.has(n));
    if (nexts.length === 0 || path.length - 1 >= maxDepth) {
      if (path.length > 1) chains.push([...path]);
      return;
    }
    for (const next of nexts) {
      path.push(next);
      onPath.add(next);
      walk(next);
      path.pop();
      onPath.delete(next);
      if (chains.length >= maxChains) return;
    }
  };
  walk(id);
  return chains;
}
