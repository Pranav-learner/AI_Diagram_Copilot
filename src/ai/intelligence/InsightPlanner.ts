/**
 * InsightPlanner — assembles what the LLM sees for a proactive briefing.
 *
 * The model receives the *ranked, deterministic* insights (each with a stable id
 * and its priority rationale), a diagram summary, and a compact semantic context —
 * never the raw diagram to re-analyse. Its job is to phrase the important insights
 * as proactive observations and recommend next actions, referencing insights by
 * id. This is the boundary that keeps discovery deterministic.
 */

import type { SemanticQuery } from '../understanding';
import { renderContext } from '../understanding';
import { estimateTokens } from '../core/tokens';
import type { Insight } from './model/Insight';
import { insightTypeLabel } from './model/Insight';
import type { RepositoryStats } from './FindingRepository';

const MAX_INSIGHTS_IN_PROMPT = 16;
const CONTEXT_TOKEN_BUDGET = 600;

export interface BriefingContextView {
  readonly block: string;
  readonly dependencyIds: readonly string[];
  readonly estimatedTokens: number;
}

/** Render insights as a compact, id-anchored, priority-ordered list. */
export function renderInsightsForPrompt(insights: readonly Insight[]): string {
  if (insights.length === 0) return 'No active insights — the design looks healthy.';
  const lines = insights.slice(0, MAX_INSIGHTS_IN_PROMPT).map((i) => {
    return `- [${i.id}] (${insightTypeLabel(i.type)}, ${i.severity}, priority ${i.priority.score}) ${i.title}: ${i.summary} — ${i.priority.rationale}`;
  });
  if (insights.length > MAX_INSIGHTS_IN_PROMPT) lines.push(`- …and ${insights.length - MAX_INSIGHTS_IN_PROMPT} more lower-priority insights.`);
  return lines.join('\n');
}

/** Build the full context block injected into the briefing prompt. */
export function buildBriefingContext(query: SemanticQuery, insights: readonly Insight[], stats: RepositoryStats): BriefingContextView {
  const ctx = query.extractContext({ kind: 'whole' }, { tokenBudget: CONTEXT_TOKEN_BUDGET });
  const block = [
    `Diagram summary: ${query.digest().text}`,
    '',
    `Finding repository: ${stats.active} active, ${stats.resolved} resolved, ${stats.recurring} recurring.`,
    '',
    'Ranked insights discovered by static analysis (reference these by their [id]):',
    renderInsightsForPrompt(insights),
    '',
    'Relevant semantic context:',
    renderContext(ctx),
  ].join('\n');

  const dependencyIds = [...new Set([...ctx.entities.map((e) => e.id), ...insights.flatMap((i) => i.affectedEntities)])];
  return { block, dependencyIds, estimatedTokens: estimateTokens(block) };
}
