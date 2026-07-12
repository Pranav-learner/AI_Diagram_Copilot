/**
 * The DiagramPlan — the strongly-typed, semantic contract the LLM produces.
 *
 * This is the ONLY thing the model outputs. It is deliberately **semantic**:
 * nodes, relationships, hierarchy, grouping, and styling *hints* — but
 * **no canvas coordinates and no renderer-specific fields**. The application
 * (validator → execution planner → layout engine → runtime) owns everything
 * concrete. Cross-references use LLM-chosen stable string ids (`source`,
 * `target`, `group`, `parent`), which the ExecutionPlanner maps to real DSL ids.
 *
 * The schema is the runtime source of truth; the TS types are inferred from it,
 * so validation and typing can never drift apart.
 */

import { z } from 'zod';
import { DIAGRAM_TYPES, LAYOUT_HINTS } from './DiagramType';

/** Kinds of semantic relationship (open set — `custom` is the escape hatch). */
export const RELATIONSHIP_TYPES = [
  'association',
  'dependency',
  'flow',
  'message',
  'inheritance',
  'composition',
  'aggregation',
  'transition',
  'contains',
  'link',
  'custom',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

const MetadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const MetadataSchema = z.record(z.string(), MetadataValueSchema);

export const PlanNodeSchema = z.object({
  /** Stable, LLM-chosen semantic id (e.g. `api-gateway`). Unique within the plan. */
  id: z.string().min(1),
  label: z.string().min(1),
  /** Semantic role (e.g. `database`, `decision`, `service`) — not a shape. */
  type: z.string().optional(),
  description: z.string().optional(),
  /** Id of a group this node belongs to. */
  group: z.string().optional(),
  /** Id of a parent node (hierarchy hint for tree/mind-map layouts). */
  parent: z.string().optional(),
  metadata: MetadataSchema.optional(),
});

export const PlanRelationshipSchema = z.object({
  id: z.string().optional(),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(RELATIONSHIP_TYPES).optional(),
  /** Arrow direction. */
  direction: z.enum(['forward', 'back', 'both', 'none']).optional(),
});

export const PlanGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeIds: z.array(z.string()).default([]),
});

export const PlanAnnotationSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  /** Optional node id the annotation refers to. */
  target: z.string().optional(),
});

export const StylingHintsSchema = z.object({
  theme: z.enum(['light', 'dark', 'neutral', 'colorful']).optional(),
  /** Semantic accent (a CSS color or a named hue) — a hint, applied by the app. */
  accent: z.string().optional(),
  /** Node ids to visually emphasize. */
  emphasize: z.array(z.string()).optional(),
});

export const DiagramPlanSchema = z.object({
  diagramType: z.enum(DIAGRAM_TYPES),
  title: z.string().min(1),
  description: z.string().optional(),
  /** Suggested layout; the app resolves and computes actual positions. */
  layout: z.enum(LAYOUT_HINTS).optional(),
  nodes: z.array(PlanNodeSchema).min(1),
  relationships: z.array(PlanRelationshipSchema).default([]),
  groups: z.array(PlanGroupSchema).optional(),
  annotations: z.array(PlanAnnotationSchema).optional(),
  styling: StylingHintsSchema.optional(),
  metadata: MetadataSchema.optional(),
  /** Model self-reported confidence — gated by the ResponseValidator. */
  confidence: z.number().min(0).max(1).optional(),
  version: z.string().optional(),
});

export type PlanNode = z.infer<typeof PlanNodeSchema>;
export type PlanRelationship = z.infer<typeof PlanRelationshipSchema>;
export type PlanGroup = z.infer<typeof PlanGroupSchema>;
export type PlanAnnotation = z.infer<typeof PlanAnnotationSchema>;
export type StylingHints = z.infer<typeof StylingHintsSchema>;
export type DiagramPlan = z.infer<typeof DiagramPlanSchema>;
