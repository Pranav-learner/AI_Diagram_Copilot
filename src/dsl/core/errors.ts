/**
 * Typed error classes the DSL throws. Callers can `instanceof`-narrow to
 * distinguish a malformed document from a failed migration from a validation
 * failure, instead of string-matching messages.
 */

import type { ValidationIssue } from '../validation/codes';

/** Base class for every error originating inside the DSL. */
export class DiagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramError';
  }
}

/** Input was not a structurally valid {@link DiagramDocument} (bad JSON shape). */
export class DiagramShapeError extends DiagramError {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramShapeError';
  }
}

/** A document failed semantic validation. Carries the offending issues. */
export class DiagramValidationError extends DiagramError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    const summary = issues.map((i) => `${i.code}: ${i.message}`).join('; ');
    super(`Diagram validation failed: ${summary}`);
    this.name = 'DiagramValidationError';
    this.issues = issues;
  }
}

/** No migration path exists from a document's schema version to the current one. */
export class DiagramMigrationError extends DiagramError {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramMigrationError';
  }
}
