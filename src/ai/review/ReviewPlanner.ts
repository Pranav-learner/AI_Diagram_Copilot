/**
 * ReviewPlanner — assembles what the LLM sees.
 *
 * The model is handed the *results* of static analysis, not the raw diagram to
 * re-analyse: a diagram summary, a compact semantic context slice, the computed
 * scores, and the deterministic findings (each with a stable id it must reference).
 * Its job is explanation / prioritisation / trade-offs — it is explicitly told not
 * to invent new issues. This is the boundary that keeps discovery deterministic.
 */

import type { SemanticQuery } from '../understanding';
import { renderContext } from '../understanding';
import { estimateTokens } from '../core/tokens';
import type { Finding } from './model/Finding';
import type { ReviewScope, ReviewScores } from './model/Review';

const MAX_FINDINGS_IN_PROMPT = 24;
const CONTEXT_TOKEN_BUDGET = 700;

export interface ReviewContextView {
  readonly block: string;
  readonly dependencyIds: readonly string[];
  readonly estimatedTokens: number;
}

/** Render findings as a compact, id-anchored list for the prompt. */
export function renderFindingsForPrompt(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No issues were detected by static analysis.';
  const lines = findings.slice(0, MAX_FINDINGS_IN_PROMPT).map((f) => {
    const evidence = f.evidence.length > 0 ? ` Evidence: ${f.evidence[0]}` : '';
    return `- [${f.id}] (${f.severity}/${f.category}) ${f.title}: ${f.message}${evidence}`;
  });
  if (findings.length > MAX_FINDINGS_IN_PROMPT) lines.push(`- …and ${findings.length - MAX_FINDINGS_IN_PROMPT} more lower-severity findings.`);
  return lines.join('\n');
}

/** Render the scores compactly. */
export function renderScoresForPrompt(scores: ReviewScores): string {
  const dims = scores.dimensions.map((d) => `${d.label} ${d.score}`).join(', ');
  return `${scores.overall.label}: ${scores.overall.score}/100 (${scores.overall.grade}). Dimensions: ${dims}.`;
}

/** Build the full context block injected into the review prompt. */
export function buildReviewContext(
  query: SemanticQuery,
  findings: readonly Finding[],
  scores: ReviewScores,
  scope: ReviewScope,
): ReviewContextView {
  const contextScope = scope.kind === 'whole' ? ({ kind: 'whole' } as const) : ({ kind: 'subgraph', ids: scope.ids } as const);
  const ctx = query.extractContext(contextScope, { tokenBudget: CONTEXT_TOKEN_BUDGET });

  const block = [
    `Diagram summary: ${query.digest().text}`,
    '',
    `Computed scores: ${renderScoresForPrompt(scores)}`,
    '',
    'Findings discovered by static analysis (reference these by their [id]):',
    renderFindingsForPrompt(findings),
    '',
    'Relevant semantic context:',
    renderContext(ctx),
  ].join('\n');

  const dependencyIds = [
    ...new Set([
      ...ctx.entities.map((e) => e.id),
      ...ctx.groups.map((g) => g.id),
      ...findings.flatMap((f) => f.affectedEntities),
    ]),
  ];

  return { block, dependencyIds, estimatedTokens: estimateTokens(block) };
}
