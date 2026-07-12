/**
 * Transaction ids + the synchronization lock.
 *
 * Every coordinated update runs inside a transaction with a monotonic id (useful
 * for tracing and for events). The **lock** is the first line of loop defense:
 * while the bridge is writing a scene to the canvas, the lock is held, and any
 * `onChange` the canvas emits in response is recognized as an echo and ignored.
 *
 * The lock is a depth counter (re-entrant): synchronous echoes are caught by
 * `runApplying`; asynchronous echoes (Excalidraw dispatches `onChange` a tick
 * later) are caught by holding a `lock()` handle across that window.
 */

import type { ChangeOrigin } from '../state/DiagramState';

export interface Transaction {
  readonly id: number;
  readonly origin: ChangeOrigin;
}

export class TransactionManager {
  private counter = 0;
  private applyingDepth = 0;

  /** Open a new transaction with a fresh id. */
  begin(origin: ChangeOrigin): Transaction {
    return { id: ++this.counter, origin };
  }

  get lastId(): number {
    return this.counter;
  }

  /** True while a scene is being applied to the canvas (echoes must be ignored). */
  get isApplying(): boolean {
    return this.applyingDepth > 0;
  }

  /** Run `fn` with the lock held — catches synchronous echoes. */
  runApplying<T>(fn: () => T): T {
    this.applyingDepth += 1;
    try {
      return fn();
    } finally {
      this.applyingDepth -= 1;
    }
  }

  /**
   * Acquire the lock manually; returns a release fn. Use to keep the lock held
   * across an async settle window (the canvas emits its echo after apply returns).
   * Idempotent release.
   */
  lock(): () => void {
    this.applyingDepth += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.applyingDepth -= 1;
    };
  }
}
