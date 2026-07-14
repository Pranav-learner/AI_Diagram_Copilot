/**
 * The Explanation schema — the structured output contract for the LLM.
 *
 * The model returns *prose only*, shaped as a small JSON object: a summary, key
 * points, and (for detailed depth) headed sections whose bodies are markdown. It
 * never returns ids, operations, or related elements — those are derived
 * deterministically from the Semantic Graph by the app, so the model can't
 * hallucinate structure. Everything passes through {@link ResponseValidator}
 * against this schema before it is trusted.
 */

import { z } from 'zod';

export const ExplanationSectionSchema = z.object({
  heading: z.string().min(1).max(120),
  body: z.string().min(1),
});

export const ExplanationSchema = z.object({
  /** One-to-three sentence gist of the target. */
  summary: z.string().min(1),
  /** Short, scannable takeaways. */
  keyPoints: z.array(z.string().min(1)).max(8).optional(),
  /** Headed sections (markdown bodies). Present for `detailed` depth. */
  sections: z.array(ExplanationSectionSchema).max(8).optional(),
  /** Model self-reported confidence; gated by the validator's floor. */
  confidence: z.number().min(0).max(1).optional(),
});

/** The validated model output (prose only). */
export type Explanation = z.infer<typeof ExplanationSchema>;
