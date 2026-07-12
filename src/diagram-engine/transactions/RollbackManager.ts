/**
 * RollbackManager — safe transaction unwinding on failure.
 *
 * A failure inside a transaction must never leave the runtime with a dangling
 * transaction on the stack or the DSL half-mutated. Because working documents are
 * never committed until the outermost transaction succeeds, rollback is simply
 * "discard the working state" — this helper guarantees the stack is unwound to
 * (and including) the failed transaction even if an event handler throws.
 */

import type { TransactionManager } from './TransactionManager';
import type { TransactionContext } from './TransactionContext';

export class RollbackManager {
  /**
   * Discard the failed transaction (and any nested ones still open above it).
   * Returns a human-readable reason for the `transaction:rolled-back` event.
   */
  rollback(transactions: TransactionManager, failed: TransactionContext, error: unknown): string {
    let current = transactions.current;
    while (current && current.id >= failed.id) {
      transactions.end();
      current = transactions.current;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
