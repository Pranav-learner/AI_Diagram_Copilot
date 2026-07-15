import type { ExecutionNode } from '../execution-graph/ExecutionNode';

export class FailureManager {
  static shouldRetry(node: ExecutionNode, attempt: number): boolean {
    if (!node.retryPolicy) return false;
    return attempt < node.retryPolicy.maxRetries;
  }

  static getRetryDelay(node: ExecutionNode, attempt: number): number {
    if (!node.retryPolicy) return 0;
    const { initialDelayMs, backoffMultiplier } = node.retryPolicy;
    return initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  }

  static async handleFailure(
    node: ExecutionNode,
    error: Error,
    rollbackHook?: () => Promise<void>
  ): Promise<'retry' | 'fallback' | 'skip' | 'abort'> {
    // Trigger rollback hook if supplied to undo partial edits
    if (rollbackHook) {
      try {
        await rollbackHook();
      } catch (rollbackErr) {
        // Suppress rollback errors to prioritize reporting the primary node error
        console.error(`Rollback hook failed for node "${node.id}":`, rollbackErr);
      }
    }

    if (node.failurePolicy) {
      return node.failurePolicy.policy;
    }

    return 'abort';
  }
}
