/**
 * The Briefing schema — the LLM's (reasoning-only) output for a proactive brief.
 *
 * The Intelligence Engine hands the model the ranked, deterministic insights and
 * asks it to phrase the important ones as proactive observations ("I noticed …")
 * with a recommended next action. The model references insights by id and may not
 * invent new ones — discovery stays deterministic. {@link FormattedBriefing} is the
 * UI-ready result, and it is fully valid even when the LLM is unavailable.
 */

import { z } from 'zod';

export const InsightObservationSchema = z.object({
  /** Must reference an insight id supplied to the model. */
  insightId: z.string().min(1),
  observation: z.string().min(1),
  recommendation: z.string().optional(),
});

export const InsightBriefingSchema = z.object({
  /** A one-line headline for the current state of the design. */
  headline: z.string().min(1),
  observations: z.array(InsightObservationSchema).max(20).optional(),
  /** Ordered, most-important-first. */
  nextActions: z.array(z.string().min(1)).max(10).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type InsightBriefing = z.infer<typeof InsightBriefingSchema>;

export interface BriefingObservation {
  readonly insightId: string;
  readonly observation: string;
  readonly recommendation?: string;
}

export interface FormattedBriefing {
  readonly headline: string;
  readonly observations: readonly BriefingObservation[];
  readonly nextActions: readonly string[];
  /** The whole briefing rendered as markdown. */
  readonly markdown: string;
  /** True when the LLM was unavailable and the briefing is deterministic-only. */
  readonly degraded: boolean;
}
