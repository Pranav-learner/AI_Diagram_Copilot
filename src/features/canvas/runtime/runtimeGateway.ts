/**
 * The one place that bridges the AI layer's {@link DiagramGateway} port to the
 * concrete {@link DiagramRuntime}. It lives in the app/integration layer (not in
 * `@/ai`), so the AI layer stays engine-independent while the runtime evolves
 * behind the port.
 *
 * An atomic plan commits as a single undoable transaction with origin
 * `'program'` — the runtime then renders it back to the canvas via the bridge,
 * and the whole generation is one undo away. Because it flows through
 * `executeType`, every operation is validated by the runtime before it mutates
 * the DSL; a failing operation rolls the entire transaction back, so a bad plan
 * can never leave a half-built diagram.
 */

import type { DiagramGateway, OperationApplyResult, OperationPlan } from '@/ai';
import type { DiagramRuntime, OperationRegistry } from '@/diagram-engine';
import { createDefaultOperationRegistry } from '@/diagram-engine';

export function createRuntimeGateway(
  runtime: DiagramRuntime,
  operations: OperationRegistry = createDefaultOperationRegistry(),
): DiagramGateway {
  return {
    knownOperationTypes: () => operations.types(),
    apply(plan: OperationPlan): OperationApplyResult {
      const run = () => {
        for (const op of plan.operations) {
          runtime.executeType(op.type, op.params, op.label ? { label: op.label } : {});
        }
      };
      if (plan.atomic) {
        runtime.transaction(() => run(), { label: plan.label ?? 'Generate diagram', origin: 'program' });
      } else {
        run();
      }
      return { applied: plan.operations.length, version: runtime.getVersion() };
    },
  };
}
