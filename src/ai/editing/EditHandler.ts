/**
 * EditHandler — conversational editing as an {@link IntentHandler}.
 *
 * The non-interactive counterpart to {@link DiagramEditor}: it plugs `edit` into
 * the generic {@link AIPipeline} (intent → prompt → schema → toOperations). It
 * shares the exact same {@link EditExecutionPlanner} and validation — the only
 * difference is it has no preview/approval loop, so it **refuses** ambiguous
 * edits (throwing rather than guessing) to preserve the "never guess" rule. The
 * interactive editor remains the primary, preview-first path.
 */

import type { IntentHandler } from '../pipeline/IntentHandler';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import type { DiagramContextSource } from '../planning/ContextBuilder';
import type { EditPlan } from './model/EditPlan';
import { EditPlanSchema } from './model/EditPlan';
import { understandDiagram } from './DiagramUnderstanding';
import { EditExecutionPlanner } from './EditExecutionPlanner';
import { validateEditPlan } from './validateEditPlan';
import { EditError } from './errors';
import { editPromptV1, EDIT_INTENT } from './prompts/editPrompts';

export interface EditHandlerDeps {
  /** Read-side port to the diagram being edited. */
  readonly contextSource: DiagramContextSource;
  readonly executionPlanner?: EditExecutionPlanner;
}

export function createEditHandler(deps: EditHandlerDeps): IntentHandler<EditPlan> {
  const planner = deps.executionPlanner ?? new EditExecutionPlanner();
  return {
    intent: EDIT_INTENT,
    promptTemplate: editPromptV1,
    schema: EditPlanSchema,
    tier: 'reasoning',
    toOperations(plan): OperationPlan {
      const understanding = understandDiagram(deps.contextSource);

      const structural = validateEditPlan(plan);
      if (!structural.ok) throw new EditError('The edit plan was structurally invalid', 'validating', structural.errors);

      const compiled = planner.compile(plan, understanding);
      const hard = compiled.issues.filter((i) => i.severity === 'error');
      if (hard.length > 0) throw new EditError('The edit plan referenced unknown elements', 'validating', hard);
      if (compiled.clarifications.length > 0) {
        throw new EditError('The request is ambiguous — use the interactive editor to clarify.', 'validating');
      }
      return compiled.operations;
    },
  };
}
