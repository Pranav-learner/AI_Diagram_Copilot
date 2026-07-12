/**
 * Clarification + issue types for the edit flow.
 *
 * When a reference is ambiguous, the app asks rather than guesses — a
 * {@link Clarification} carries the question and the concrete candidates the user
 * chooses from. Hard problems (an unknown reference, a conflicting edit) are
 * {@link EditIssue}s that reject the plan. Both are surfaced to the UI.
 */

import type { ElementReference } from './model/EditPlan';
import type { Candidate } from './ReferenceResolver';

export interface Clarification {
  readonly code: string;
  /** User-facing question, e.g. "Which service did you mean?" */
  readonly message: string;
  /** The ambiguous reference that triggered this. */
  readonly reference: ElementReference;
  /** The elements the user can choose between. */
  readonly candidates: readonly Candidate[];
  /** Index of the edit in the plan that needs clarifying. */
  readonly editIndex: number;
}

export type IssueSeverity = 'error' | 'warning';

export interface EditIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: IssueSeverity;
  readonly editIndex?: number;
}

export function editError(code: string, message: string, editIndex?: number): EditIssue {
  return { code, message, severity: 'error', editIndex };
}

export function editWarning(code: string, message: string, editIndex?: number): EditIssue {
  return { code, message, severity: 'warning', editIndex };
}
