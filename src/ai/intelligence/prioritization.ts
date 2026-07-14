/**
 * Prioritization — rank insights transparently and explain why.
 *
 * The spec asks for ranking by severity, confidence, business impact, technical
 * impact, frequency, diagram context, and user activity — and for each ranking to
 * be *explained*. This computes a numeric score as the sum of those weighted
 * factors and records every non-zero factor, so the UI can show "ranked because:
 * critical severity · affects a central hub · recurring". Fully deterministic for a
 * given priority context.
 */

import { severityRank, type ReviewCategory, type Severity } from '../review';
import type { InsightDraft } from './aggregation';
import type { Insight, InsightPriority, PriorityFactor } from './model/Insight';

/** Context that shapes ranking beyond the insight's own attributes. */
export interface PriorityContext {
  /** Structurally central entities (from topology hubs). */
  readonly hubs: ReadonlySet<string>;
  /** Entities the user recently selected/edited (user activity signal). */
  readonly recentlyTouched: ReadonlySet<string>;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 40, high: 25, medium: 12, low: 5, info: 1 };

/** How much each category matters to the *business*. */
const BUSINESS_IMPACT: Record<string, number> = {
  security: 15,
  availability: 12,
  reliability: 10,
  process: 9,
  correctness: 8,
  scalability: 8,
  performance: 6,
  coupling: 4,
  observability: 3,
  maintainability: 3,
  'best-practice': 2,
  structure: 2,
};

/** How much each category matters *technically*. */
const TECH_IMPACT: Record<string, number> = {
  scalability: 8,
  coupling: 8,
  performance: 8,
  availability: 8,
  reliability: 8,
  correctness: 6,
  security: 6,
  maintainability: 6,
  process: 4,
  structure: 4,
  observability: 4,
  'best-practice': 2,
};

function impact(map: Record<string, number>, category: ReviewCategory): number {
  return map[category as string] ?? 3;
}

/** Score one insight draft and produce its transparent priority. */
export function scoreInsight(draft: InsightDraft, ctx: PriorityContext): InsightPriority {
  const factors: PriorityFactor[] = [];
  const add = (label: string, points: number) => {
    if (points > 0) factors.push({ label, points: Math.round(points) });
  };

  add(`${draft.severity} severity`, SEVERITY_WEIGHT[draft.severity]);
  add('high confidence', draft.confidence >= 0.8 ? draft.confidence * 8 : 0);
  add('business impact', impact(BUSINESS_IMPACT, draft.category));
  add('technical impact', impact(TECH_IMPACT, draft.category));
  if (draft.seenCount > 1) add('recurring', Math.min(draft.seenCount - 1, 5) * 3);
  if (draft.affectedEntities.some((id) => ctx.hubs.has(id))) add('affects a central hub', 8);
  if (draft.affectedEntities.some((id) => ctx.recentlyTouched.has(id))) add('affects a recently-edited element', 6);

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const top = [...factors].sort((a, b) => b.points - a.points).slice(0, 3).map((f) => f.label);
  const rationale = top.length > 0 ? `Ranked by: ${top.join(' · ')}.` : 'Low-priority informational item.';
  return { score, rationale, factors };
}

/** Attach priority + status to drafts and return them ranked, highest-first. */
export function prioritize(drafts: readonly InsightDraft[], ctx: PriorityContext): Insight[] {
  const insights: Insight[] = drafts.map((draft) => ({ ...draft, status: 'active', priority: scoreInsight(draft, ctx) }));
  insights.sort((a, b) => {
    if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
    const s = severityRank(a.severity) - severityRank(b.severity);
    return s !== 0 ? s : a.id.localeCompare(b.id);
  });
  return insights;
}
