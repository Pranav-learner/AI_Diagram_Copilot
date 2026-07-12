/**
 * OperationValidator — runs an operation's own preconditions plus any registered
 * *global* validators (e.g. a future permission/lock policy). Extensible without
 * touching individual operations (Open/Closed).
 */

import type { Operation, OperationContext, OperationIssue } from '../operations/Operation';

export type GlobalValidator = (op: Operation, ctx: OperationContext) => OperationIssue[];

export class OperationValidator {
  private readonly globals: GlobalValidator[] = [];

  /** Add a cross-cutting check applied to every operation. Chainable. */
  addGlobal(validator: GlobalValidator): this {
    this.globals.push(validator);
    return this;
  }

  validate(op: Operation, ctx: OperationContext): OperationIssue[] {
    const issues = [...op.validate(ctx)];
    for (const global of this.globals) issues.push(...global(op, ctx));
    return issues;
  }
}
