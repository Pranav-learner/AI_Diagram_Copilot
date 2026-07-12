/**
 * OperationDispatcher — run a sequence of operations atomically.
 *
 * Threads a working document through each operation (so op N sees op N-1's
 * result). If ANY operation fails validation, the whole batch is abandoned and
 * the base document is returned unchanged — the atomicity guarantee behind
 * batches and transactions. On success it returns one combined patch.
 */

import type { DiagramDocument } from '@/dsl';
import type { Operation, OperationContext, OperationIssue } from '../operations/Operation';
import type { OperationExecutor } from './OperationExecutor';
import type { DocumentPatch } from '../patch/DocumentPatch';
import { diffToPatch } from '../patch/DocumentPatch';

export interface DispatchResult {
  readonly ok: boolean;
  readonly document: DiagramDocument;
  readonly patch: DocumentPatch;
  readonly issues: readonly OperationIssue[];
  /** The type of the operation that failed, if any. */
  readonly failedType?: string;
}

export class OperationDispatcher {
  constructor(private readonly executor: OperationExecutor) {}

  dispatch(ops: readonly Operation[], baseCtx: OperationContext): DispatchResult {
    let working = baseCtx.document;
    for (const op of ops) {
      const result = this.executor.execute(op, { ...baseCtx, document: working });
      if (!result.ok) {
        return {
          ok: false,
          document: baseCtx.document,
          patch: {},
          issues: result.issues,
          failedType: op.type,
        };
      }
      working = result.document;
    }
    return { ok: true, document: working, patch: diffToPatch(baseCtx.document, working), issues: [] };
  }
}
