/**
 * Generation-specific errors, on top of the foundation {@link AIError} family.
 */

import { AIError } from '../core/AIError';
import type { PlanIssue } from './validation/validatePlan';

export type GenerationPhase =
  | 'understanding'
  | 'planning'
  | 'validating'
  | 'layout'
  | 'executing'
  | 'rendering';

/** A generation attempt failed at a specific phase. Carries plan issues, if any. */
export class GenerationError extends AIError {
  override readonly retryable = false;
  readonly phase: GenerationPhase;
  readonly issues: readonly PlanIssue[];
  constructor(message: string, phase: GenerationPhase, issues: readonly PlanIssue[] = []) {
    super(message);
    this.phase = phase;
    this.issues = issues;
  }
}
