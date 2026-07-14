/**
 * Context extraction — turn a scope (whole diagram, selection, node, group,
 * subgraph, neighbourhood, path) into a compact, relevant slice of the Semantic
 * Graph fit for an LLM prompt.
 *
 * This is the bridge between the IR and the model: it decides *what the model
 * needs to see* to answer a question about a region, and nothing more. It ranks
 * by relevance (focus first, then structural salience) and truncates against a
 * token budget, always making the omission explicit — the model is told what it
 * cannot see rather than silently starved. The Context Builder (future) renders
 * these into the final prompt; every future AI capability extracts through here.
 */

import type { SemanticGraph } from '../model/graph';
import type { SemanticEntity } from '../model/entity';
import type { SemanticRelationship } from '../model/relationship';
import type { SemanticGroup } from '../model/group';
import { estimateTokens } from '../../core/tokens';
import { neighborhood } from '../analysis/traversal';
import { shortestPath } from '../analysis/paths';
import { groupEntitiesDeep } from '../analysis/hierarchy';

/** The region of the diagram a caller wants context for. */
export type ContextScope =
  | { readonly kind: 'whole' }
  | { readonly kind: 'selection'; readonly ids: readonly string[] }
  | { readonly kind: 'entity'; readonly id: string }
  | { readonly kind: 'group'; readonly id: string }
  | { readonly kind: 'subgraph'; readonly ids: readonly string[] }
  | { readonly kind: 'neighborhood'; readonly id: string; readonly radius?: number }
  | { readonly kind: 'path'; readonly from: string; readonly to: string };

export interface ContextExtractOptions {
  /** Soft token budget for the rendered context; entities are dropped to fit. */
  readonly tokenBudget?: number;
  /** For `entity`/`selection` scopes, how many hops of surrounding context to add. */
  readonly contextRadius?: number;
  /** Include enclosing groups for hierarchy context. Default true. */
  readonly includeGroups?: boolean;
  /** Hard cap on entities regardless of budget. */
  readonly maxEntities?: number;
}

export interface ExtractedContext {
  readonly scope: ContextScope;
  /** The primary entities the scope is *about*. */
  readonly focusIds: readonly string[];
  /** Every entity included (focus + surrounding context that survived truncation). */
  readonly entities: readonly SemanticEntity[];
  /** Relationships whose endpoints are both included. */
  readonly relationships: readonly SemanticRelationship[];
  /** Enclosing/relevant groups. */
  readonly groups: readonly SemanticGroup[];
  /** Relationships that cross the boundary (endpoint outside the included set). */
  readonly boundaryRelationshipCount: number;
  /** True when entities were dropped to fit the budget. */
  readonly truncated: boolean;
  readonly estimatedTokens: number;
}

const DEFAULT_TOKEN_BUDGET = 1500;
const DEFAULT_MAX_ENTITIES = 120;

/** Resolve a scope to its focus set and an initially-broad candidate set. */
function resolveScope(
  graph: SemanticGraph,
  scope: ContextScope,
  contextRadius: number,
): { focus: string[]; candidates: Set<string> } {
  const has = (id: string) => graph.entities.has(id);
  switch (scope.kind) {
    case 'whole': {
      const all = [...graph.entities.keys()];
      return { focus: all, candidates: new Set(all) };
    }
    case 'selection': {
      const focus = scope.ids.filter(has);
      const candidates = new Set(focus);
      if (contextRadius > 0) for (const id of focus) for (const n of neighborhood(graph, id, contextRadius)) candidates.add(n);
      return { focus, candidates };
    }
    case 'entity': {
      const focus = has(scope.id) ? [scope.id] : [];
      const candidates = new Set(focus);
      if (contextRadius > 0 && focus.length) for (const n of neighborhood(graph, scope.id, contextRadius)) candidates.add(n);
      return { focus, candidates };
    }
    case 'group': {
      const members = groupEntitiesDeep(graph, scope.id).filter(has);
      return { focus: members, candidates: new Set(members) };
    }
    case 'subgraph': {
      const focus = scope.ids.filter(has);
      return { focus, candidates: new Set(focus) };
    }
    case 'neighborhood': {
      const hood = has(scope.id) ? [...neighborhood(graph, scope.id, scope.radius ?? 1)] : [];
      return { focus: has(scope.id) ? [scope.id] : [], candidates: new Set(hood) };
    }
    case 'path': {
      const path = shortestPath(graph, scope.from, scope.to, { direction: 'both' });
      const nodes = path ? path.nodes : [];
      return { focus: [...nodes], candidates: new Set(nodes) };
    }
  }
}

/** Relevance rank: focus entities are pinned; the rest sort by degree then area. */
function rankCandidates(graph: SemanticGraph, focus: ReadonlySet<string>, candidates: ReadonlySet<string>): string[] {
  const rest = [...candidates].filter((id) => !focus.has(id));
  rest.sort((a, b) => {
    const dd = graph.index.degree(b) - graph.index.degree(a);
    if (dd !== 0) return dd;
    return (graph.entities.get(b)?.geometry.area ?? 0) - (graph.entities.get(a)?.geometry.area ?? 0);
  });
  return [...focus, ...rest];
}

export function extractContext(
  graph: SemanticGraph,
  scope: ContextScope,
  opts: ContextExtractOptions = {},
): ExtractedContext {
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const maxEntities = opts.maxEntities ?? DEFAULT_MAX_ENTITIES;
  const contextRadius = opts.contextRadius ?? 1;
  const includeGroups = opts.includeGroups ?? true;

  const { focus, candidates } = resolveScope(graph, scope, contextRadius);
  const focusSet = new Set(focus);
  const ranked = rankCandidates(graph, focusSet, candidates);

  // Greedily include entities (focus always wins) until the budget or cap is hit.
  const included = new Set<string>();
  let truncated = false;
  let runningTokens = 0;
  for (const id of ranked) {
    const entity = graph.entities.get(id);
    if (!entity) continue;
    const mustInclude = focusSet.has(id);
    const cost = estimateTokens(JSON.stringify(compactEntity(entity)));
    if (!mustInclude && (included.size >= maxEntities || runningTokens + cost > tokenBudget)) {
      truncated = true;
      continue;
    }
    included.add(id);
    runningTokens += cost;
  }

  const entities = [...included].map((id) => graph.entities.get(id)!);
  const relationships: SemanticRelationship[] = [];
  let boundaryRelationshipCount = 0;
  for (const rel of graph.relationships.values()) {
    const s = included.has(rel.source);
    const t = included.has(rel.target);
    if (s && t) relationships.push(rel);
    else if (s || t) boundaryRelationshipCount++;
  }

  const groups: SemanticGroup[] = [];
  if (includeGroups) {
    const groupIds = new Set<string>();
    for (const id of included) {
      const gid = graph.entities.get(id)?.groupId;
      if (gid && graph.groups.has(gid)) groupIds.add(gid);
    }
    for (const gid of groupIds) groups.push(graph.groups.get(gid)!);
  }

  const ctx: ExtractedContext = {
    scope,
    focusIds: focus,
    entities,
    relationships,
    groups,
    boundaryRelationshipCount,
    truncated,
    estimatedTokens: 0,
  };
  return { ...ctx, estimatedTokens: estimateTokens(renderContext(ctx)) };
}

// ── rendering ──────────────────────────────────────────────────────────────

function compactEntity(e: SemanticEntity) {
  return {
    id: e.id,
    kind: e.kind,
    label: e.label,
    ...(e.description ? { desc: e.description } : {}),
    ...(e.groupId ? { group: e.groupId } : {}),
    ...(e.tags.length ? { tags: e.tags } : {}),
  };
}

/**
 * Render an {@link ExtractedContext} as a compact fenced JSON block for prompt
 * injection. Ids are surfaced so the model can reference elements precisely.
 */
export function renderContext(ctx: ExtractedContext): string {
  const payload = {
    focus: ctx.focusIds,
    entities: ctx.entities.map(compactEntity),
    relationships: ctx.relationships.map((r) => ({
      id: r.id,
      kind: r.kind,
      from: r.source,
      to: r.target,
      ...(r.label ? { label: r.label } : {}),
    })),
    groups: ctx.groups.map((g) => ({ id: g.id, label: g.label, members: g.memberIds })),
    ...(ctx.boundaryRelationshipCount ? { boundaryRelationships: ctx.boundaryRelationshipCount } : {}),
    ...(ctx.truncated ? { truncated: true } : {}),
  };
  return ['```json', JSON.stringify(payload), '```'].join('\n');
}

/** Estimated token cost of the rendered context. */
export function contextTokens(ctx: ExtractedContext): number {
  return estimateTokens(renderContext(ctx));
}
