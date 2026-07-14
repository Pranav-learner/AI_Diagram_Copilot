/**
 * Review result types — scores, the LLM's (explanation-only) output schema, and
 * the final formatted review the UI renders.
 *
 * The division of labour is encoded here: {@link ReviewScores} and {@link Finding}s
 * are computed by the application; {@link ReviewExplanationSchema} is the *only*
 * thing the LLM produces, and it may not invent findings — it references them by
 * id. {@link FormattedReview} fuses both, and remains fully valid even when the
 * LLM is unavailable (graceful degradation).
 */

import { z } from 'zod';
import type { ExplanationDomain } from '../../explain';
import type { Finding, Severity } from './Finding';

/** What to review: the whole diagram or a chosen subset. */
export type ReviewScope = { readonly kind: 'whole' } | { readonly kind: 'selection'; readonly ids: readonly string[] };

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** One transparent, explained score on a 0–100 scale. */
export interface Scorecard {
  /** Machine key, e.g. `security`, `overall`, `complexity`. */
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly grade: Grade;
  /** Plain-language explanation of how the score was computed. */
  readonly rationale: string;
}

export interface ReviewScores {
  readonly overall: Scorecard;
  readonly dimensions: readonly Scorecard[];
}

// ── LLM output (explanation only) ────────────────────────────────────────────

export const FindingNoteSchema = z.object({
  /** Must reference a finding id supplied to the model. */
  findingId: z.string().min(1),
  /** The model's explanation / trade-off / context for that finding. */
  note: z.string().min(1),
});

export const ReviewExplanationSchema = z.object({
  /** An overall narrative summary of the review (markdown allowed). */
  summary: z.string().min(1),
  /** Positive observations / things done well. */
  strengths: z.array(z.string().min(1)).max(10).optional(),
  /** The most important actions, already prioritised, most-important first. */
  priorityActions: z.array(z.string().min(1)).max(10).optional(),
  /** Per-finding explanations, keyed by the provided finding ids. */
  findingNotes: z.array(FindingNoteSchema).max(40).optional(),
  /** Notable trade-offs to weigh. */
  tradeoffs: z.array(z.string().min(1)).max(10).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/** The validated model output. */
export type ReviewExplanation = z.infer<typeof ReviewExplanationSchema>;

// ── Formatted review (UI-ready) ──────────────────────────────────────────────

/** A finding plus the LLM's optional explanatory note. */
export interface ReviewFinding extends Finding {
  /** The model's explanation for this finding, when present. */
  readonly note?: string;
}

export interface FormattedReview {
  readonly domain: ExplanationDomain;
  readonly scopeLabel: string;
  /** Overall narrative (from the LLM, or a deterministic fallback). */
  readonly summary: string;
  readonly scores: ReviewScores;
  /** All findings, prioritised, each optionally annotated by the LLM. */
  readonly findings: readonly ReviewFinding[];
  readonly strengths: readonly string[];
  readonly priorityActions: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly counts: { readonly bySeverity: Record<Severity, number>; readonly total: number };
  /** Union of all affected ids, for one-click highlighting on the canvas. */
  readonly affectedEntities: readonly string[];
  /** The whole review rendered as a single markdown document. */
  readonly markdown: string;
  /** True when the LLM was unavailable and the review is deterministic-only. */
  readonly degraded: boolean;
}
