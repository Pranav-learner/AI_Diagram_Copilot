/**
 * Shared schema building blocks for structured LLM output.
 *
 * All structured responses share an envelope — a `kind` discriminant, a schema
 * `version`, a self-reported `confidence`, and an optional human `summary` —
 * wrapping a feature-specific `data` payload. {@link planEnvelope} builds that
 * envelope around any feature schema, so a future capability defines *only* its
 * `data` shape and inherits validation, versioning, and confidence gating for
 * free. This is the structured-output contract every feature plugs into.
 */

import { z } from 'zod';

/** A probability in [0,1]. */
export const ConfidenceSchema = z.number().min(0).max(1);

export const NonEmptyString = z.string().min(1);

/**
 * Wrap a feature's `data` schema in the standard AI-plan envelope.
 *
 * @param kind stable discriminant, e.g. `diagram.generate`, `diagram.edit`.
 * @param data the feature-specific payload schema.
 */
export function planEnvelope<T extends z.ZodTypeAny>(kind: string, data: T) {
  return z.object({
    kind: z.literal(kind),
    version: z.string().default('v1'),
    confidence: ConfidenceSchema.default(1),
    summary: z.string().optional(),
    data,
  });
}

/** The common envelope fields, without a payload — for generic inspection. */
export const PlanEnvelopeHeadSchema = z.object({
  kind: z.string().min(1),
  version: z.string().default('v1'),
  confidence: ConfidenceSchema.default(1),
  summary: z.string().optional(),
});

export type PlanEnvelopeHead = z.infer<typeof PlanEnvelopeHeadSchema>;
