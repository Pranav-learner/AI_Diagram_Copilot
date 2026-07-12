/**
 * TransactionManager — the runtime's transaction stack (operation atomicity).
 *
 * Distinct from `sync/TransactionManager` (the M3 canvas apply-lock) — this one
 * governs whether operations commit atomically. Kept internal to the runtime
 * (not in the public barrel), so there is no name clash for consumers.
 */

import type { DiagramDocument } from '@/dsl';
import type { ChangeOrigin } from '../state/DiagramState';
import type { TransactionContext } from './TransactionContext';

export class TransactionManager {
  private readonly stack: TransactionContext[] = [];
  private counter = 0;

  get depth(): number {
    return this.stack.length;
  }
  get active(): boolean {
    return this.stack.length > 0;
  }
  get current(): TransactionContext | undefined {
    return this.stack[this.stack.length - 1];
  }
  get lastId(): number {
    return this.counter;
  }

  begin(label: string, baseDocument: DiagramDocument, origin: ChangeOrigin): TransactionContext {
    const tx: TransactionContext = {
      id: ++this.counter,
      label,
      origin,
      baseDocument,
      workingDocument: baseDocument,
    };
    this.stack.push(tx);
    return tx;
  }

  end(): TransactionContext | undefined {
    return this.stack.pop();
  }
}
