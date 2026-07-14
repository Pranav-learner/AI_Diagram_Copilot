/**
 * Shared, deterministic graph utilities for review rules.
 *
 * These are the heavier structural primitives several rules build on — chiefly
 * **articulation points** (cut vertices), the textbook basis for single-point-of-
 * failure detection. Everything is pure and O(V+E) over the Semantic Graph's
 * precomputed adjacency; the DFS is iterative so it is safe on large diagrams.
 */

import type { RuleContext } from '../model/Rule';
import type { SemanticEntity, SemanticGraph } from '../../understanding';

/**
 * Articulation points (cut vertices): entities whose removal increases the number
 * of connected components — i.e. structurally load-bearing nodes. Iterative Tarjan
 * over undirected adjacency.
 */
export function articulationPoints(graph: SemanticGraph): Set<string> {
  const ap = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const visited = new Set<string>();
  let timer = 0;

  interface Frame {
    u: string;
    parent: string | null;
    iter: Iterator<string>;
    children: number;
  }

  for (const start of graph.entities.keys()) {
    if (visited.has(start)) continue;
    visited.add(start);
    disc.set(start, timer);
    low.set(start, timer);
    timer++;
    const stack: Frame[] = [{ u: start, parent: null, iter: graph.index.neighbors(start)[Symbol.iterator](), children: 0 }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.iter.next();
      if (!next.done) {
        const v = next.value;
        if (v === frame.parent) continue;
        if (!visited.has(v)) {
          visited.add(v);
          disc.set(v, timer);
          low.set(v, timer);
          timer++;
          frame.children++;
          stack.push({ u: v, parent: frame.u, iter: graph.index.neighbors(v)[Symbol.iterator](), children: 0 });
        } else {
          low.set(frame.u, Math.min(low.get(frame.u)!, disc.get(v)!));
        }
      } else {
        stack.pop();
        if (frame.parent === null) {
          if (frame.children > 1) ap.add(frame.u); // root: AP iff >1 DFS child
        } else {
          const parent = stack[stack.length - 1]!;
          low.set(parent.u, Math.min(low.get(parent.u)!, low.get(frame.u)!));
          if (parent.parent !== null && low.get(frame.u)! >= disc.get(parent.u)!) ap.add(parent.u);
        }
      }
    }
  }
  return ap;
}

/** In-scope entities matching a predicate. */
export function entitiesWhere(ctx: RuleContext, pred: (e: SemanticEntity) => boolean): SemanticEntity[] {
  return ctx.scopedEntities().filter(pred);
}

/** True when any in-scope entity's kind is in `kinds`. */
export function hasKind(ctx: RuleContext, kinds: readonly string[]): boolean {
  return ctx.scopedEntities().some((e) => kinds.includes(e.kind));
}

/** True when any in-scope entity's label or kind matches `re`. */
export function hasEntityMatching(ctx: RuleContext, re: RegExp): boolean {
  return ctx.scopedEntities().some((e) => re.test(e.label) || re.test(e.kind));
}

/** In-degree / out-degree restricted to the reviewed scope. */
export function scopedDegree(ctx: RuleContext, id: string): { in: number; out: number } {
  let incoming = 0;
  let outgoing = 0;
  for (const relId of ctx.graph.index.incoming(id)) {
    const r = ctx.graph.relationships.get(relId);
    if (r && ctx.inScope(r.source)) incoming++;
  }
  for (const relId of ctx.graph.index.outgoing(id)) {
    const r = ctx.graph.relationships.get(relId);
    if (r && ctx.inScope(r.target)) outgoing++;
  }
  return { in: incoming, out: outgoing };
}

/** Entities reachable (undirected) from any of `starts`, within scope. */
export function reachableFrom(ctx: RuleContext, starts: readonly string[]): Set<string> {
  const seen = new Set<string>(starts.filter((id) => ctx.inScope(id)));
  const queue = [...seen];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    for (const n of ctx.graph.index.neighbors(id)) {
      if (!seen.has(n) && ctx.inScope(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Kinds commonly treated as external clients / actors. */
export const CLIENT_KINDS = ['user', 'actor', 'externalSystem'] as const;
/** Kinds that represent a request-entry / edge boundary. */
export const GATEWAY_KINDS = ['gateway', 'loadBalancer'] as const;
/** Data-tier kinds. */
export const DATA_KINDS = ['database', 'storage'] as const;
/** Compute-tier kinds. */
export const SERVICE_KINDS = ['service', 'api', 'function', 'component', 'server'] as const;
