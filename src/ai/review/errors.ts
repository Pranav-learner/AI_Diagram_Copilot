/**
 * Diagram Review errors — phase-tagged, mirroring the other capability modules.
 *
 * Note that most failure modes do NOT surface as errors: the review degrades
 * gracefully instead. A provider outage, a validation failure, or a slow model
 * yields a deterministic review (findings + scores, no LLM prose) rather than an
 * error. `ReviewError` is reserved for the rare cases where even that is impossible.
 */

import type { AIIssue } from '../core/types';

export type ReviewPhase = 'analyzing' | 'scoring' | 'planning' | 'explaining' | 'formatting';

export class ReviewError extends Error {
  override readonly name = 'ReviewError';
  readonly phase: ReviewPhase;
  readonly issues: readonly AIIssue[];

  constructor(message: string, phase: ReviewPhase, issues: readonly AIIssue[] = []) {
    super(message);
    this.phase = phase;
    this.issues = issues;
  }
}
