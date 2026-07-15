import type { ExecutionUnit, ExecutionResult } from './ExecutionUnit';
import type { ExecutionContext } from './ExecutionContext';
import type { ExecutionStateStore, ExecutionState } from './ExecutionState';
import type { EventBus } from '../events/EventBus';
import { ExecutionLifecycleRunner } from './ExecutionLifecycle';

export interface ExecutionManagerOptions {
  readonly stateStore: ExecutionStateStore;
  readonly eventBus: EventBus;
  readonly concurrencyLimit?: number;
}

export class ExecutionManager {
  private readonly stateStore: ExecutionStateStore;
  private readonly eventBus: EventBus;
  private readonly concurrencyLimit: number;
  private activeCount = 0;
  private readonly queue: (() => void)[] = [];

  constructor(options: ExecutionManagerOptions) {
    this.stateStore = options.stateStore;
    this.eventBus = options.eventBus;
    this.concurrencyLimit = options.concurrencyLimit ?? 10;
  }

  async run(
    unit: ExecutionUnit,
    context: ExecutionContext,
    retryOptions?: { maxRetries?: number; initialDelayMs?: number }
  ): Promise<ExecutionResult> {
    const runId = `run-${Math.random().toString(36).substr(2, 9)}`;
    context.addMetadata('activeUnitId', unit.id);
    context.addMetadata('runId', runId);

    const initialState: ExecutionState = {
      id: runId,
      unitId: unit.id,
      status: 'Pending',
      startedAt: new Date(),
      retries: 0,
      progress: 0,
    };
    await this.stateStore.set(initialState);

    const progressUnsub = context.progressReporter.subscribe((update) => {
      this.stateStore.get(runId).then((state) => {
        if (state) {
          this.stateStore.set({
            ...state,
            progress: update.progress,
            lastMessage: update.message,
          });
        }
      });

      this.eventBus.publish({
        type: 'execution:progress',
        timestamp: update.timestamp,
        traceId: context.traceId,
        taskId: context.taskId,
        sessionId: context.sessionId,
        unitId: unit.id,
        progress: update.progress,
        message: update.message,
      });
    });

    await this.acquireSlot();

    try {
      await this.updateStatus(runId, 'Running');

      await this.eventBus.publish({
        type: 'execution:started',
        timestamp: new Date(),
        traceId: context.traceId,
        taskId: context.taskId,
        sessionId: context.sessionId,
        unitId: unit.id,
        userGoal: context.userGoal,
      });

      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (context.budget.timeoutMs) {
          timeoutId = setTimeout(() => {
            context.cancellationToken.cancel('Execution timed out');
            reject(new Error(`Execution timed out after ${context.budget.timeoutMs}ms`));
          }, context.budget.timeoutMs);
        }
      });

      const executeWithRetry = async (): Promise<ExecutionResult> => {
        const maxRetries = retryOptions?.maxRetries ?? 0;
        const initialDelay = retryOptions?.initialDelayMs ?? 1000;
        let attempt = 0;

        while (true) {
          try {
            const result = await ExecutionLifecycleRunner.run(unit, context);
            if (result.success) {
              return result;
            }
            throw result.error || new Error('Execution failed');
          } catch (err: any) {
            attempt++;
            if (attempt > maxRetries || context.cancellationToken.isCancelled) {
              throw err;
            }

            await this.stateStore.get(runId).then((state) => {
              if (state) {
                this.stateStore.set({
                  ...state,
                  status: 'Retrying',
                  retries: attempt,
                  lastMessage: `Retry attempt ${attempt} due to: ${err.message}`,
                });
              }
            });

            const delay = initialDelay * Math.pow(2, attempt - 1);
            const jitter = delay * Math.random();
            const sleepMs = Math.min(jitter + delay, 30000);

            context.checkCancellation();
            await new Promise<void>((resolve, reject) => {
              const sleepTimeout = setTimeout(() => {
                cancelUnsub();
                resolve();
              }, sleepMs);

              const cancelUnsub = context.cancellationToken.onCancel(() => {
                clearTimeout(sleepTimeout);
                reject(new Error(context.cancellationToken.cancellationReason || 'Cancelled during sleep'));
              });
            });
            context.checkCancellation();
          }
        }
      };

      const executionPromise = executeWithRetry();
      const result = await Promise.race([executionPromise, timeoutPromise]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (result.success) {
        await this.updateStatus(runId, 'Succeeded', result);
        await this.eventBus.publish({
          type: 'execution:completed',
          timestamp: new Date(),
          traceId: context.traceId,
          taskId: context.taskId,
          sessionId: context.sessionId,
          unitId: unit.id,
          result,
        });
      } else {
        throw result.error || new Error('Execution failed');
      }

      return result;
    } catch (err: any) {
      if (context.cancellationToken.isCancelled) {
        const cancelResult = {
          success: false,
          error: err,
          executionTimeMs: 0,
        };
        await this.updateStatus(runId, 'Cancelled', cancelResult);
        await this.eventBus.publish({
          type: 'execution:cancelled',
          timestamp: new Date(),
          traceId: context.traceId,
          taskId: context.taskId,
          sessionId: context.sessionId,
          unitId: unit.id,
          reason: context.cancellationToken.cancellationReason || err.message,
        });
        return cancelResult;
      } else {
        const errorResult = {
          success: false,
          error: err,
          executionTimeMs: 0,
        };
        await this.updateStatus(runId, 'Failed', errorResult);
        await this.eventBus.publish({
          type: 'execution:failed',
          timestamp: new Date(),
          traceId: context.traceId,
          taskId: context.taskId,
          sessionId: context.sessionId,
          unitId: unit.id,
          error: err,
        });
        return errorResult;
      }
    } finally {
      progressUnsub();
      this.releaseSlot();
    }
  }

  private async updateStatus(id: string, status: any, result?: ExecutionResult): Promise<void> {
    const state = await this.stateStore.get(id);
    if (state) {
      await this.stateStore.set({
        ...state,
        status,
        completedAt: ['Succeeded', 'Failed', 'Cancelled'].includes(status) ? new Date() : undefined,
        result,
      });
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.concurrencyLimit) {
      this.activeCount++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private releaseSlot(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      this.activeCount++;
      next();
    }
  }
}
