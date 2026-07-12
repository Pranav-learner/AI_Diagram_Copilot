/**
 * OperationExecutor — validate + apply a single operation against a document,
 * returning the next document and the reversible {@link DocumentPatch}. Pure and
 * stateless; the runtime layers transactions/history/events on top.
 */

import type { DiagramDocument } from '@/dsl';
import type { Operation, OperationContext, OperationIssue } from '../operations/Operation';
import type { OperationValidator } from '../validation/OperationValidator';
import type { DocumentPatch } from '../patch/DocumentPatch';
import { diffToPatch } from '../patch/DocumentPatch';

export interface ExecuteResult {
  readonly ok: boolean;
  readonly document: DiagramDocument;
  readonly patch: DocumentPatch;
  readonly issues: readonly OperationIssue[];
}

export class OperationExecutor {
  constructor(private readonly validator: OperationValidator) {}

  execute(op: Operation, ctx: OperationContext): ExecuteResult {
    const issues = this.validator.validate(op, ctx);
    if (issues.length > 0) {
      return { ok: false, document: ctx.document, patch: {}, issues };
    }
    const document = op.apply(ctx);
    const patch = diffToPatch(ctx.document, document);
    return { ok: true, document, patch, issues: [] };
  }
}
