/**
 * Explain Mode errors — a small, phase-tagged error type.
 *
 * Mirrors the editing module's {@link EditError}: one error carrying the pipeline
 * phase it failed in, so the UI can show *where* things went wrong (planning vs.
 * the model vs. formatting) and offer the right recovery. Provider/network errors
 * surface as the AI layer's {@link AIError} family and are not re-wrapped.
 */

import type { AIIssue } from '../core/types';

/** The stages of the explanation pipeline, used for progress + error attribution. */
export type ExplainPhase = 'planning' | 'context' | 'generating' | 'validating' | 'formatting';

export class ExplainError extends Error {
  override readonly name = 'ExplainError';
  readonly phase: ExplainPhase;
  readonly issues: readonly AIIssue[];

  constructor(message: string, phase: ExplainPhase, issues: readonly AIIssue[] = []) {
    super(message);
    this.phase = phase;
    this.issues = issues;
  }
}
