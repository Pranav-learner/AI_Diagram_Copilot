/**
 * Editing-specific errors, on top of the foundation {@link AIError} family.
 */

import { AIError } from '../core/AIError';
import type { EditIssue } from './clarification';

export type EditPhase = 'understanding' | 'planning' | 'validating' | 'preview' | 'executing' | 'rendering';

/** An edit attempt failed at a phase. Carries any validation issues. */
export class EditError extends AIError {
  override readonly retryable = false;
  readonly phase: EditPhase;
  readonly issues: readonly EditIssue[];
  constructor(message: string, phase: EditPhase, issues: readonly EditIssue[] = []) {
    super(message);
    this.phase = phase;
    this.issues = issues;
  }
}
