/**
 * Small, pure graph utilities shared by the layout algorithms.
 *
 * Adjacency building, root detection, BFS levels, and child maps — the
 * primitives the hierarchy-based layouts (tree, radial, mind map) need. Kept
 * dependency-free and separate so each algorithm stays focused on placement.
 */

import type { LayoutEdge, LayoutPosition } from './types';

export interface Adjacency {
  /** child ids per node (directed source→target). */
  readonly out: Map<string, string[]>;
  /** parent ids per node (directed). */
  readonly in: Map<string, string[]>;
  /** neighbour ids per node (undirected). */
  readonly undirected: Map<string, string[]>;
}

export function buildAdjacency(nodeIds: readonly string[], edges: readonly LayoutEdge[]): Adjacency {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  const undirected = new Map<string, string[]>();
  for (const id of nodeIds) {
    out.set(id, []);
    inn.set(id, []);
    undirected.set(id, []);
  }
  for (const e of edges) {
    if (!out.has(e.source) || !out.has(e.target)) continue; // ignore dangling
    out.get(e.source)!.push(e.target);
    inn.get(e.target)!.push(e.source);
    undirected.get(e.source)!.push(e.target);
    undirected.get(e.target)!.push(e.source);
  }
  return { out, in: inn, undirected };
}

/**
 * Roots for a hierarchy: nodes with no incoming edge. If the graph is cyclic
 * (none qualify), fall back to the highest out-degree node so we still have a
 * starting point.
 */
export function findRoots(nodeIds: readonly string[], adj: Adjacency): string[] {
  const roots = nodeIds.filter((id) => (adj.in.get(id)?.length ?? 0) === 0);
  if (roots.length > 0) return roots;
  if (nodeIds.length === 0) return [];
  const byOutDegree = [...nodeIds].sort((a, b) => (adj.out.get(b)?.length ?? 0) - (adj.out.get(a)?.length ?? 0));
  return [byOutDegree[0]!];
}

/** BFS depth of each node from the given roots (undirected traversal). */
export function bfsLevels(roots: readonly string[], adj: Adjacency): Map<string, number> {
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const r of roots) {
    if (!level.has(r)) {
      level.set(r, 0);
      queue.push(r);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const depth = level.get(id)!;
    for (const next of adj.undirected.get(id) ?? []) {
      if (!level.has(next)) {
        level.set(next, depth + 1);
        queue.push(next);
      }
    }
  }
  // Disconnected nodes (unreachable) default to the deepest level + 1.
  return level;
}

/** Translate all positions so the top-left of the bounding box is (0,0). */
export function normalizeToOrigin(
  positions: Map<string, LayoutPosition>,
  sizes: Map<string, { width: number; height: number }>,
): { positions: Record<string, LayoutPosition>; size: { width: number; height: number } } {
  if (positions.size === 0) return { positions: {}, size: { width: 0, height: 0 } };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, pos] of positions) {
    const s = sizes.get(id) ?? { width: 0, height: 0 };
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + s.width);
    maxY = Math.max(maxY, pos.y + s.height);
  }
  const out: Record<string, LayoutPosition> = {};
  for (const [id, pos] of positions) out[id] = { x: pos.x - minX, y: pos.y - minY };
  return { positions: out, size: { width: maxX - minX, height: maxY - minY } };
}
