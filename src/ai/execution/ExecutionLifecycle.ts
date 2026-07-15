import type { ExecutionContext } from './ExecutionContext';
import type { ExecutionUnit, ExecutionResult } from './ExecutionUnit';

export type LifecycleStage =
  | 'initialize'
  | 'validate'
  | 'execute'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'retry'
  | 'complete'
  | 'cleanup';

export interface ExecutionLifecycleListener {
  onStageTransition?(stage: LifecycleStage, context: ExecutionContext): void | Promise<void>;
  onError?(stage: LifecycleStage, error: Error, context: ExecutionContext): void | Promise<void>;
}

export class ExecutionLifecycleRunner {
  static async run(
    unit: ExecutionUnit,
    context: ExecutionContext,
    listener?: ExecutionLifecycleListener
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let stage: LifecycleStage = 'initialize';

    const transition = async (nextStage: LifecycleStage) => {
      stage = nextStage;
      if (listener?.onStageTransition) {
        await listener.onStageTransition(stage, context);
      }
    };

    const handleError = async (err: Error): Promise<ExecutionResult> => {
      if (listener?.onError) {
        try {
          await listener.onError(stage, err, context);
        } catch {
          // Ignore
        }
      }
      return {
        success: false,
        error: err,
        executionTimeMs: Date.now() - startTime,
      };
    };

    try {
      context.checkCancellation();

      // Initialize
      await transition('initialize');
      if (unit.initialize) {
        await unit.initialize(context);
      }

      context.checkCancellation();

      // Validate
      await transition('validate');
      if (unit.validate) {
        const isValid = await unit.validate(context);
        if (!isValid) {
          throw new Error(`Validation failed for execution unit "${unit.id}"`);
        }
      }

      context.checkCancellation();

      // Execute
      await transition('execute');
      context.incrementSteps();
      const result = await unit.execute(context);

      // Complete
      await transition('complete');
      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (context.cancellationToken.isCancelled) {
        await transition('cancel');
        return handleError(err || new Error('Cancelled'));
      }
      return handleError(err);
    } finally {
      // Cleanup
      try {
        stage = 'cleanup';
        if (listener?.onStageTransition) {
          await listener.onStageTransition('cleanup', context);
        }
        if (unit.cleanup) {
          await unit.cleanup(context);
        }
      } catch (cleanupErr: any) {
        if (listener?.onError) {
          try {
            await listener.onError('cleanup', cleanupErr, context);
          } catch {
            // Ignore
          }
        }
      }
    }
  }
}
