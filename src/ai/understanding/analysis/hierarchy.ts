/**
 * Hierarchy analysis — the *containment* axis (groups/containers), kept strictly
 * separate from the relationship graph.
 *
 * Where {@link ./traversal} walks relationships (dependency direction), this walks
 * the containment tree: which group an entity sits in, the full chain of enclosing
 * groups, and everything (transitively) inside a group. `parentOf`/`childrenOf`
 * on the index make each hop O(1).
 */

import type { SemanticGraph } from '../model/graph';

/**
 * The chain of enclosing groups from the direct parent up to the outermost group,
 * for an entity or group id. Ordered nearest-first (`[direct, …, root]`).
 */
export function ancestors(graph: SemanticGraph, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = graph.index.parentOf(id);
  while (cur && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = graph.index.parentOf(cur);
  }
  return out;
}

/**
 * The containment path from the outermost enclosing group down to `id` inclusive
 * (`[root, …, id]`) — the mirror of {@link ancestors}, ordered for display.
 */
export function containmentPath(graph: SemanticGraph, id: string): string[] {
  return [...ancestors(graph, id).reverse(), id];
}

/**
 * Every descendant of a group/container id (nested groups *and* leaf entities),
 * discovered by a BFS over the containment tree. Excludes the group itself.
 */
export function descendants(graph: SemanticGraph, groupId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([groupId]);
  const queue = [...graph.index.childrenOf(groupId)];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of graph.index.childrenOf(id)) if (!seen.has(child)) queue.push(child);
  }
  return out;
}

/** Just the *entity* members reachable inside a group (descendants minus groups). */
export function groupEntitiesDeep(graph: SemanticGraph, groupId: string): string[] {
  return descendants(graph, groupId).filter((id) => graph.entities.has(id));
}

/**
 * Lowest common ancestor group of two ids in the containment tree, or `undefined`
 * when they share no enclosing group.
 */
export function commonAncestor(graph: SemanticGraph, a: string, b: string): string | undefined {
  const chainA = new Set(ancestors(graph, a));
  if (chainA.has(b)) return b;
  for (const anc of ancestors(graph, b)) {
    if (chainA.has(anc)) return anc;
  }
  return undefined;
}

/** Depth of an id in the containment tree (0 = top-level, not nested). */
export function containmentDepth(graph: SemanticGraph, id: string): number {
  return ancestors(graph, id).length;
}

/** Top-level groups (those with no enclosing group). */
export function rootGroups(graph: SemanticGraph): string[] {
  const out: string[] = [];
  for (const group of graph.groups.values()) {
    if (!group.parentGroupId) out.push(group.id);
  }
  return out;
}
