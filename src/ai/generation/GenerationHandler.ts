/**
 * GenerationHandler — the diagram-generation capability as an {@link IntentHandler}.
 *
 * This is the proof that the P3M1 foundation's extensibility thesis holds: the
 * whole feature plugs into the generic {@link AIPipeline} by supplying an intent,
 * a prompt template, a response schema, and a `toOperations` mapping — nothing
 * more. The pipeline handles intent routing, context, prompting, completion, and
 * schema validation; the handler adds semantic validation + execution planning.
 *
 * The richer, streaming/staged {@link DiagramGenerator} is the direct entry point
 * for the "Generate" UI; this handler is the intent-routed entry point. Both
 * share the exact same {@link ExecutionPlanner} and validation — no duplication.
 */

import type { IntentHandler } from '../pipeline/IntentHandler';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import type { DiagramPlan } from './model/DiagramPlan';
import { DiagramPlanSchema } from './model/DiagramPlan';
import type { DiagramTypeRegistry } from './model/DiagramType';
import { ExecutionPlanner } from './ExecutionPlanner';
import { validatePlan } from './validation/validatePlan';
import { GenerationError } from './errors';
import { generationPromptV1 } from './prompts/generationPrompts';
import { GENERATION_INTENT } from './prompts/generationPrompts';

export interface GenerationHandlerDeps {
  readonly executionPlanner?: ExecutionPlanner;
  readonly typeRegistry?: DiagramTypeRegistry;
}

export function createGenerationHandler(deps: GenerationHandlerDeps = {}): IntentHandler<DiagramPlan> {
  const planner = deps.executionPlanner ?? new ExecutionPlanner({ typeRegistry: deps.typeRegistry });
  return {
    intent: GENERATION_INTENT,
    // Inline template → the pipeline needs no pre-seeded PromptRegistry.
    promptTemplate: generationPromptV1,
    schema: DiagramPlanSchema,
    tier: 'reasoning',
    toOperations(plan): OperationPlan {
      // The pipeline already schema-validated; enforce semantic coherence here.
      const semantic = validatePlan(plan);
      if (!semantic.ok) {
        throw new GenerationError('The generated plan was structurally invalid', 'validating', semantic.errors);
      }
      return planner.plan(plan).operations;
    },
  };
}
