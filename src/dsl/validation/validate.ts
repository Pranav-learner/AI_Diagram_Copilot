/**
 * The validation entry point.
 *
 * Runs a set of {@link ValidationRule}s over a document and partitions the
 * collected issues into errors and warnings. `valid` is true iff there are no
 * error-severity issues. Callers can pass a custom rule set (e.g. to add a
 * project-specific rule) — the default is {@link DEFAULT_RULES}.
 */

import type { DiagramDocument } from '../model/document';
import type { ValidationResult } from './codes';
import type { ValidationRule } from './rules';
import { DEFAULT_RULES } from './rules';

export function validate(
  doc: DiagramDocument,
  rules: readonly ValidationRule[] = DEFAULT_RULES,
): ValidationResult {
  const issues = rules.flatMap((rule) => rule(doc));
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { valid: errors.length === 0, issues, errors, warnings };
}
