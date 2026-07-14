/**
 * ReviewFormatter — fuses deterministic output with the LLM's explanations.
 *
 * Findings, scores, and strengths come from the application; the LLM contributes a
 * narrative summary, per-finding notes, prioritised actions, and trade-offs. The
 * formatter merges them into one {@link FormattedReview} and renders a markdown
 * document. Crucially it works with **no** LLM contribution (`degraded`): it
 * synthesises a summary and priority actions from the findings themselves, so a
 * provider outage never blocks a useful, deterministic review.
 */

import type { ExplanationDomain } from '../explain';
import { countBySeverity, type Finding, type Severity } from './model/Finding';
import type { FormattedReview, ReviewExplanation, ReviewFinding, ReviewScope, ReviewScores } from './model/Review';

export interface FormatReviewInput {
  readonly domain: ExplanationDomain;
  readonly scope: ReviewScope;
  readonly findings: readonly Finding[];
  readonly scores: ReviewScores;
  /** Positive findings derived deterministically from the graph. */
  readonly strengths: readonly string[];
  /** The LLM's contribution, when available. */
  readonly explanation?: ReviewExplanation;
  readonly degraded: boolean;
}

export function formatReview(input: FormatReviewInput): FormattedReview {
  const { domain, scope, findings, scores, explanation } = input;
  const notes = new Map<string, string>((explanation?.findingNotes ?? []).map((n) => [n.findingId, n.note]));
  const reviewFindings: ReviewFinding[] = findings.map((f) => ({ ...f, ...(notes.has(f.id) ? { note: notes.get(f.id) } : {}) }));

  const bySeverity = countBySeverity(findings);
  const summary = explanation?.summary ?? deterministicSummary(findings, scores, bySeverity);
  const strengths = dedupe([...(input.strengths ?? []), ...(explanation?.strengths ?? [])]).slice(0, 8);
  const priorityActions = explanation?.priorityActions ?? deterministicPriorityActions(findings);
  const tradeoffs = explanation?.tradeoffs ?? [];
  const affectedEntities = [...new Set(findings.flatMap((f) => f.affectedEntities))];
  const scopeLabel = scope.kind === 'whole' ? 'the whole diagram' : `${scope.ids.length} selected element(s)`;

  const markdown = renderMarkdown(summary, scores, reviewFindings, strengths, priorityActions, tradeoffs);

  return {
    domain,
    scopeLabel,
    summary,
    scores,
    findings: reviewFindings,
    strengths,
    priorityActions,
    tradeoffs,
    counts: { bySeverity, total: findings.length },
    affectedEntities,
    markdown,
    degraded: input.degraded,
  };
}

// ── Deterministic fallbacks (used when the LLM is unavailable) ────────────────

function deterministicSummary(findings: readonly Finding[], scores: ReviewScores, bySeverity: Record<Severity, number>): string {
  if (findings.length === 0) {
    return `No issues were detected by static analysis. ${scores.overall.label} is ${scores.overall.score}/100 (${scores.overall.grade}).`;
  }
  const parts = (['critical', 'high', 'medium', 'low', 'info'] as const).filter((s) => bySeverity[s] > 0).map((s) => `${bySeverity[s]} ${s}`);
  const top = findings[0]!;
  return (
    `Static analysis found ${findings.length} issue(s) (${parts.join(', ')}). ` +
    `${scores.overall.label}: ${scores.overall.score}/100 (${scores.overall.grade}). ` +
    `The most significant is "${top.title}": ${top.message}`
  );
}

function deterministicPriorityActions(findings: readonly Finding[]): string[] {
  return findings
    .filter((f) => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 5)
    .map((f) => f.recommendation);
}

function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// ── Markdown rendering ────────────────────────────────────────────────────────

function renderMarkdown(
  summary: string,
  scores: ReviewScores,
  findings: readonly ReviewFinding[],
  strengths: readonly string[],
  priorityActions: readonly string[],
  tradeoffs: readonly string[],
): string {
  const parts: string[] = [summary.trim()];

  parts.push(
    [`**${scores.overall.label}: ${scores.overall.score}/100 (${scores.overall.grade})**`, ...scores.dimensions.map((d) => `- ${d.label}: ${d.score} (${d.grade})`)].join('\n'),
  );

  if (priorityActions.length > 0) {
    parts.push(['## Priority actions', ...priorityActions.map((a, i) => `${i + 1}. ${a}`)].join('\n'));
  }

  if (findings.length > 0) {
    const lines = findings.map((f) => {
      const head = `- **${f.title}** (${f.severity}) — ${f.message}`;
      const rec = `  - Recommendation: ${f.recommendation}`;
      const note = f.note ? `  - ${f.note}` : '';
      return [head, rec, note].filter(Boolean).join('\n');
    });
    parts.push([`## Findings (${findings.length})`, ...lines].join('\n'));
  }

  if (strengths.length > 0) parts.push(['## Strengths', ...strengths.map((s) => `- ${s}`)].join('\n'));
  if (tradeoffs.length > 0) parts.push(['## Trade-offs', ...tradeoffs.map((t) => `- ${t}`)].join('\n'));

  return parts.join('\n\n');
}
