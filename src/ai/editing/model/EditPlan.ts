/**
 * The EditPlan — the strongly-typed, semantic contract for conversational edits.
 *
 * As with generation, the LLM produces ONLY this plan. It never edits the DSL,
 * never emits runtime operations, and never sends renderer details. Crucially it
 * refers to existing elements by **reference** ({@link ElementReference}) rather
 * than by DSL id it invented: an id it read from the context, a label, the
 * current selection, a not-yet-created local ref, a fuzzy descriptor, or a
 * superlative. The application's ReferenceResolver turns those into concrete DSL
 * ids — and, when a reference is ambiguous, asks the user instead of guessing.
 *
 * Positions are expressed **relatively** ("below the User Service"), never as raw
 * coordinates — the application computes geometry. The schema is the source of
 * truth; the TS types are `z.infer`'d from it.
 */

import { z } from 'zod';

// ── References ──────────────────────────────────────────────────────────────

export const SUPERLATIVE_METRICS = [
  'largest',
  'smallest',
  'leftmost',
  'rightmost',
  'topmost',
  'bottommost',
] as const;
export type SuperlativeMetric = (typeof SUPERLATIVE_METRICS)[number];

/**
 * How the model points at an element. A resolver maps this to concrete ids
 * against the live diagram + selection. `descriptor`/`label`/`superlative` may
 * match many (or none) → the app clarifies rather than guessing.
 */
export const ElementReferenceSchema = z.discriminatedUnion('by', [
  /** A concrete DSL id the model read from the diagram context. */
  z.object({ by: z.literal('id'), id: z.string().min(1) }),
  /** Match by (normalized) label text. */
  z.object({ by: z.literal('label'), label: z.string().min(1) }),
  /** The current selection (all, or the Nth selected element). */
  z.object({ by: z.literal('selection'), index: z.number().int().nonnegative().optional() }),
  /** A node created earlier in THIS plan (its `ref`). Node references only. */
  z.object({ by: z.literal('new'), ref: z.string().min(1) }),
  /** A fuzzy description — matched against label + semantic role. May be ambiguous. */
  z.object({ by: z.literal('descriptor'), text: z.string().min(1) }),
  /** A superlative ("the largest node", "the left group"). */
  z.object({ by: z.literal('superlative'), metric: z.enum(SUPERLATIVE_METRICS) }),
]);
export type ElementReference = z.infer<typeof ElementReferenceSchema>;

// ── Shared value objects ────────────────────────────────────────────────────

/** Semantic style hints — colours by name or hex; the app resolves to a Style. */
export const StyleHintsSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  emphasize: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
});
export type StyleHints = z.infer<typeof StyleHintsSchema>;

/** Where to move a node — relative to another element, a nudge, or (rarely) absolute. */
export const MoveTargetSchema = z.object({
  relativeTo: ElementReferenceSchema.optional(),
  direction: z.enum(['above', 'below', 'left', 'right']).optional(),
  /** Gap in px when placing relative to another element. */
  gap: z.number().optional(),
  /** A relative nudge. */
  delta: z.object({ dx: z.number(), dy: z.number() }).optional(),
  /** Absolute position — discouraged; only when the user gave explicit coordinates. */
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type MoveTarget = z.infer<typeof MoveTargetSchema>;

const MetadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);

// ── Edit operations ─────────────────────────────────────────────────────────

export const EditOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    /** Local id for referencing this node later in the plan. */
    ref: z.string().min(1),
    label: z.string().min(1),
    /** Semantic role (service, database, decision, …). */
    nodeType: z.string().optional(),
    /** Place near an existing element (direction optional). */
    near: ElementReferenceSchema.optional(),
    direction: z.enum(['above', 'below', 'left', 'right']).optional(),
    /** Optional group to add the new node to (existing group ref or new group ref). */
    group: z.string().optional(),
  }),
  z.object({ op: z.literal('remove_node'), target: ElementReferenceSchema }),
  z.object({ op: z.literal('rename_node'), target: ElementReferenceSchema, label: z.string().min(1) }),
  z.object({ op: z.literal('move_node'), target: ElementReferenceSchema, to: MoveTargetSchema }),
  z.object({
    op: z.literal('resize_node'),
    target: ElementReferenceSchema,
    size: z.object({ width: z.number().positive().optional(), height: z.number().positive().optional() }).optional(),
    scale: z.number().positive().optional(),
  }),
  z.object({
    op: z.literal('connect'),
    source: ElementReferenceSchema,
    target: ElementReferenceSchema,
    label: z.string().optional(),
    direction: z.enum(['forward', 'back', 'both', 'none']).optional(),
  }),
  z.object({ op: z.literal('disconnect'), source: ElementReferenceSchema, target: ElementReferenceSchema }),
  z.object({ op: z.literal('update_style'), targets: z.array(ElementReferenceSchema).min(1), style: StyleHintsSchema }),
  z.object({
    op: z.literal('update_metadata'),
    target: ElementReferenceSchema,
    key: z.string().min(1),
    value: MetadataValueSchema,
  }),
  z.object({ op: z.literal('group'), targets: z.array(ElementReferenceSchema).min(1), label: z.string().min(1) }),
  z.object({ op: z.literal('ungroup'), target: ElementReferenceSchema }),
  z.object({ op: z.literal('reorder'), target: ElementReferenceSchema, position: z.enum(['front', 'back', 'forward', 'backward']) }),
]);
export type EditOp = z.infer<typeof EditOpSchema>;
export type EditOpKind = EditOp['op'];

// ── The plan ────────────────────────────────────────────────────────────────

export const EditPlanSchema = z.object({
  /** One-line human summary of the intended change. */
  summary: z.string().optional(),
  edits: z.array(EditOpSchema).min(1),
  confidence: z.number().min(0).max(1).optional(),
  version: z.string().optional(),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;

/** A stable string key for a reference — for structural comparison/dedup. */
export function referenceKey(ref: ElementReference): string {
  switch (ref.by) {
    case 'id':
      return `id:${ref.id}`;
    case 'label':
      return `label:${ref.label.toLowerCase()}`;
    case 'selection':
      return `sel:${ref.index ?? 'all'}`;
    case 'new':
      return `new:${ref.ref}`;
    case 'descriptor':
      return `desc:${ref.text.toLowerCase()}`;
    case 'superlative':
      return `sup:${ref.metric}`;
  }
}

export function referenceEquals(a: ElementReference, b: ElementReference): boolean {
  return referenceKey(a) === referenceKey(b);
}
