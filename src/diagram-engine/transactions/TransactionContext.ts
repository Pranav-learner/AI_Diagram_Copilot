/**
 * TransactionContext — a single in-flight transaction's working state.
 *
 * `workingDocument` is mutated as operations apply within the transaction, kept
 * separate from the committed document so nothing is visible (or persisted) until
 * the outermost transaction commits atomically.
 */

import type { DiagramDocument } from '@/dsl';
import type { ChangeOrigin } from '../state/DiagramState';

export interface TransactionContext {
  readonly id: number;
  readonly label: string;
  readonly origin: ChangeOrigin;
  readonly baseDocument: DiagramDocument;
  /** The evolving document as ops apply inside this transaction. */
  workingDocument: DiagramDocument;
}
