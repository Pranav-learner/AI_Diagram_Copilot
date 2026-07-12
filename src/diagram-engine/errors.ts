/**
 * Typed engine errors. Mirrors the DSL's `DiagramError` family so callers can
 * `instanceof`-narrow rather than string-match. Recoverable, per-entity problems
 * are {@link Warning}s (not errors); these classes are for genuine failures.
 */

import type { ValidationIssue } from '@/dsl';
import type { OperationIssue } from './operations/Operation';

export class DiagramEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramEngineError';
  }
}

/** A DSL document could not be rendered (e.g. it failed validation). */
export class RenderError extends DiagramEngineError {
  readonly issues?: readonly ValidationIssue[];
  constructor(message: string, issues?: readonly ValidationIssue[]) {
    super(message);
    this.name = 'RenderError';
    this.issues = issues;
  }
}

/** A scene could not be parsed back into a DSL document. */
export class ParseError extends DiagramEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Incremental synchronization failed. */
export class SyncError extends DiagramEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

/** A single entity could not be mapped (thrown only in `strict` mode). */
export class MappingError extends DiagramEngineError {
  readonly entityId?: string;
  constructor(message: string, entityId?: string) {
    super(message);
    this.name = 'MappingError';
    this.entityId = entityId;
  }
}

/** No renderer is registered under the requested id. */
export class RendererNotFoundError extends DiagramEngineError {
  constructor(id: string) {
    super(`No renderer registered with id "${id}"`);
    this.name = 'RendererNotFoundError';
  }
}

/** An operation failed validation and was not applied. Carries the issues. */
export class OperationError extends DiagramEngineError {
  readonly operationType: string;
  readonly issues: readonly OperationIssue[];
  constructor(operationType: string, issues: readonly OperationIssue[]) {
    const summary = issues.map((i) => i.message).join('; ') || 'invalid operation';
    super(`Operation "${operationType}" rejected: ${summary}`);
    this.name = 'OperationError';
    this.operationType = operationType;
    this.issues = issues;
  }
}

/** A transaction was rolled back (an operation inside it failed). */
export class TransactionError extends DiagramEngineError {
  readonly cause?: Error;
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'TransactionError';
    this.cause = cause;
  }
}

/** An undo/redo could not be performed (empty stack, or a corrupt entry). */
export class HistoryError extends DiagramEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryError';
  }
}

/** No operation is registered under the requested type (registry lookup). */
export class OperationNotFoundError extends DiagramEngineError {
  constructor(type: string) {
    super(`No operation registered with type "${type}"`);
    this.name = 'OperationNotFoundError';
  }
}
