/**
 * ContextView — assembles the *minimal* prompt context for an explanation.
 *
 * This is the token-discipline stage. It consumes the Understanding Engine's
 * {@link extractContext} (a compact, budgeted, relevance-ranked slice of the
 * Semantic Graph) plus a one-line diagram digest for orientation, and renders a
 * single context block. The LLM sees only this — the focused subgraph around the
 * target, never the whole diagram. The entity ids it touched are returned so the
 * explanation cache can be invalidated by region.
 */

import type { SemanticQuery } from '../understanding';
import { renderContext } from '../understanding';
import { estimateTokens } from '../core/tokens';
import type { ExplanationRequest } from './model/ExplainTypes';

export interface ExplainContextView {
  /** The rendered context block injected into the prompt. */
  readonly block: string;
  /** Entity + group ids the view depends on (cache invalidation region). */
  readonly dependencyIds: readonly string[];
  readonly estimatedTokens: number;
  /** True when the extractor dropped elements to fit the budget. */
  readonly truncated: boolean;
}

export interface ContextViewOptions {
  /** Token budget for the extracted subgraph. Kept small for focus. */
  readonly tokenBudget?: number;
}

const DEFAULT_BUDGET = 900;

/**
 * Build the context block for a planned request. Combines a short whole-diagram
 * digest (so the model understands the setting) with the extracted local context.
 */
export function buildExplainContext(
  query: SemanticQuery,
  request: ExplanationRequest,
  opts: ContextViewOptions = {},
): ExplainContextView {
  const ctx = query.extractContext(request.scope, { tokenBudget: opts.tokenBudget ?? DEFAULT_BUDGET });
  const digest = query.digest();

  const parts: string[] = [];
  parts.push(`Diagram overview: ${digest.text}`);
  parts.push(`Focus of this explanation: ${request.targetDescriptor}.`);

  // Surface the focus entity's own domain attributes (metadata) when it is a node.
  if (request.target.kind === 'node') {
    const entity = query.getEntity(request.target.id);
    const attrs = entity ? Object.entries(entity.attributes) : [];
    if (attrs.length > 0) {
      const rendered = attrs.slice(0, 8).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      parts.push(`Focus attributes: ${rendered}`);
    }
  }

  parts.push('Relevant semantic subgraph (ids, kinds, relationships):');
  parts.push(renderContext(ctx));

  const block = parts.join('\n');
  const dependencyIds = [...ctx.entities.map((e) => e.id), ...ctx.groups.map((g) => g.id), ...request.scope && scopeIds(request)];

  return {
    block,
    dependencyIds: [...new Set(dependencyIds)],
    estimatedTokens: estimateTokens(block),
    truncated: ctx.truncated,
  };
}

/** The explicit ids referenced by a request's scope (so they anchor the cache too). */
function scopeIds(request: ExplanationRequest): readonly string[] {
  const s = request.scope;
  switch (s.kind) {
    case 'entity':
    case 'group':
    case 'neighborhood':
      return [s.id];
    case 'subgraph':
    case 'selection':
      return s.ids;
    case 'path':
      return [s.from, s.to];
    case 'whole':
      return [];
  }
}
