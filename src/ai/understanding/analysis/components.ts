/**
 * Structural analysis over the relationship graph — connected components, cycle
 * detection, and topological ordering.
 *
 * These power topology summaries and (later) AI Review's "is this a DAG?",
 * "which subsystems are disconnected?", "is there a dependency cycle?" questions.
 * All are O(V + E) over the precomputed adjacency.
 */

import type { SemanticGraph } from '../model/graph';

/**
 * Weakly-connected components: entities grouped so that any two in the same group
 * are joined by an *undirected* path of relationships. Isolated entities each form
 * a singleton component. Returned largest-first for stable, useful ordering.
 */
export function connectedComponents(graph: SemanticGraph): string[][] {
  const ids = [...graph.entities.keys()];
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
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
  for (const rel of graph.relationships.values()) {
    if (graph.entities.has(rel.source) && graph.entities.has(rel.target)) union(rel.source, rel.target);
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const bucket = groups.get(root);
    if (bucket) bucket.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/**
 * Find a single directed cycle if one exists (the entity ids forming the loop,
 * with the closing node repeated at the end), else `null`. Iterative DFS colouring.
 */
export function findCycle(graph: SemanticGraph): string[] | null {
  const ids = [...graph.entities.keys()];
  const color = new Map<string, 0 | 1 | 2>();
  const onStackFrom = new Map<string, string>();
  for (const id of ids) color.set(id, 0);

  for (const start of ids) {
    if (color.get(start) !== 0) continue;
    const stack: Array<{ id: string; iter: Iterator<string> }> = [];
    color.set(start, 1);
    stack.push({ id: start, iter: graph.index.successors(start)[Symbol.iterator]() });
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
      if (c === 1) {
        // Back-edge → reconstruct the cycle child → … → frame.id → child.
        const cycle: string[] = [child];
        for (let i = stack.length - 1; i >= 0; i--) {
          cycle.push(stack[i]!.id);
          if (stack[i]!.id === child) break;
        }
        cycle.reverse();
        cycle.push(child);
        return cycle;
      }
      if (c === 0) {
        color.set(child, 1);
        onStackFrom.set(child, frame.id);
        stack.push({ id: child, iter: graph.index.successors(child)[Symbol.iterator]() });
      }
    }
  }
  return null;
}

/** Does the relationship graph contain a directed cycle? */
export function hasCycle(graph: SemanticGraph): boolean {
  return graph.stats.hasCycles;
}

/**
 * A topological ordering of entities (sources before the entities that depend on
 * them), or `null` when the graph has a directed cycle. Kahn's algorithm; ties are
 * broken by insertion order for determinism.
 */
export function topologicalOrder(graph: SemanticGraph): string[] | null {
  const indeg = new Map<string, number>();
  for (const id of graph.entities.keys()) indeg.set(id, 0);
  for (const rel of graph.relationships.values()) {
    if (graph.entities.has(rel.source) && graph.entities.has(rel.target) && rel.source !== rel.target) {
      indeg.set(rel.target, (indeg.get(rel.target) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const order: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    order.push(id);
    for (const succ of graph.index.successors(id)) {
      if (succ === id) continue;
      const d = (indeg.get(succ) ?? 0) - 1;
      indeg.set(succ, d);
      if (d === 0) queue.push(succ);
    }
  }
  return order.length === graph.entities.size ? order : null;
}

/** Entities with no incoming relationships (roots / sources). */
export function sources(graph: SemanticGraph): string[] {
  const out: string[] = [];
  for (const id of graph.entities.keys()) {
    if (graph.index.incoming(id).length === 0 && graph.index.outgoing(id).length > 0) out.push(id);
  }
  return out;
}

/** Entities with no outgoing relationships but at least one incoming (sinks). */
export function sinks(graph: SemanticGraph): string[] {
  const out: string[] = [];
  for (const id of graph.entities.keys()) {
    if (graph.index.outgoing(id).length === 0 && graph.index.incoming(id).length > 0) out.push(id);
  }
  return out;
}

/** Entities with no relationships at all. */
export function isolated(graph: SemanticGraph): string[] {
  const out: string[] = [];
  for (const id of graph.entities.keys()) {
    if (graph.index.degree(id) === 0) out.push(id);
  }
  return out;
}
