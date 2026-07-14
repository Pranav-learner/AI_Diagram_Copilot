/**
 * InsightFormatter — fuse the deterministic insights with the LLM's briefing.
 *
 * Produces the UI-ready {@link FormattedBriefing} (headline, proactive
 * observations, next actions, markdown) and enriches each insight with the model's
 * observation. Works with **no** LLM contribution (`degraded`): it synthesises the
 * headline, observations, and next actions from the ranked insights themselves, so
 * the intelligence feed is always useful.
 */

import type { RepositoryStats } from './FindingRepository';
import type { Insight } from './model/Insight';
import type { BriefingObservation, FormattedBriefing, InsightBriefing } from './model/Briefing';

export interface FormatBriefingResult {
  readonly briefing: FormattedBriefing;
  /** Insights annotated with the model's observation (when present). */
  readonly insights: readonly Insight[];
}

export function formatBriefing(
  insights: readonly Insight[],
  stats: RepositoryStats,
  explanation: InsightBriefing | undefined,
  degraded: boolean,
): FormatBriefingResult {
  const notes = new Map<string, BriefingObservation>((explanation?.observations ?? []).map((o) => [o.insightId, o]));
  const enriched = insights.map((i) => (notes.has(i.id) ? { ...i, observation: notes.get(i.id)!.observation } : i));

  const headline = explanation?.headline ?? deterministicHeadline(insights, stats);
  const observations: BriefingObservation[] =
    explanation?.observations && explanation.observations.length > 0
      ? explanation.observations
      : insights.slice(0, 5).map((i) => ({ insightId: i.id, observation: `I noticed ${lowerFirst(i.title)} — ${i.summary}`, recommendation: i.recommendation }));
  const nextActions = explanation?.nextActions ?? deterministicNextActions(insights);

  const briefing: FormattedBriefing = {
    headline,
    observations,
    nextActions,
    markdown: renderMarkdown(headline, observations, nextActions),
    degraded,
  };
  return { briefing, insights: enriched };
}

function deterministicHeadline(insights: readonly Insight[], stats: RepositoryStats): string {
  if (insights.length === 0) return 'The design looks healthy — no active insights right now.';
  const high = insights.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const recurring = stats.recurring > 0 ? ` (${stats.recurring} recurring)` : '';
  return high > 0
    ? `${insights.length} active insight(s)${recurring}, including ${high} of high priority.`
    : `${insights.length} improvement opportunit(y/ies)${recurring} available.`;
}

function deterministicNextActions(insights: readonly Insight[]): string[] {
  return insights
    .filter((i) => i.severity === 'critical' || i.severity === 'high')
    .slice(0, 5)
    .map((i) => i.recommendation);
}

function renderMarkdown(headline: string, observations: readonly BriefingObservation[], nextActions: readonly string[]): string {
  const parts: string[] = [headline.trim()];
  if (observations.length > 0) {
    parts.push(observations.map((o) => `- ${o.observation}${o.recommendation ? `\n  - **Recommendation:** ${o.recommendation}` : ''}`).join('\n'));
  }
  if (nextActions.length > 0) {
    parts.push(['## Next actions', ...nextActions.map((a, i) => `${i + 1}. ${a}`)].join('\n'));
  }
  return parts.join('\n\n');
}

function lowerFirst(s: string): string {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s;
}
