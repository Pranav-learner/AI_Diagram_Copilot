/**
 * The OperationPlan schema — the runtime-facing execution contract.
 *
 * This is the boundary object between the AI layer and the diagram engine: an
 * ordered list of **operation descriptors** (`{ type, params }`) that map 1:1 to
 * the runtime's registry (`DiagramRuntime.executeType`). The LLM never produces
 * this directly — the {@link OperationPlanner} compiles a validated high-level
 * plan into it — but it is schema-validated all the same, because *nothing*
 * reaches the runtime unvalidated.
 *
 * `params` is left as an open record here: descriptor *shape* is validated, and
 * per-operation *param* validation is the runtime operation's own `validate`
 * step (single source of truth — we do not restate it).
 */

import { z } from 'zod';

export const OperationDescriptorSchema = z.object({
  /** Registry operation type, e.g. `node.create`, `edge.connect`. */
  type: z.string().min(1),
  /** Operation parameters, forwarded verbatim to the runtime factory. */
  params: z.record(z.string(), z.unknown()).default({}),
  /** Optional history label override. */
  label: z.string().optional(),
});

export const OperationPlanSchema = z.object({
  operations: z.array(OperationDescriptorSchema),
  /** Execute atomically as one undoable transaction (default) vs. individually. */
  atomic: z.boolean().default(true),
  label: z.string().optional(),
});

export type OperationDescriptor = z.infer<typeof OperationDescriptorSchema>;
export type OperationPlan = z.infer<typeof OperationPlanSchema>;
