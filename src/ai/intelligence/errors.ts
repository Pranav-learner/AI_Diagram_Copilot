/**
 * Intelligence Engine errors — phase-tagged.
 *
 * As with Review, most failures degrade rather than throw: an analysis failure
 * keeps the previous insights, and a provider failure yields a deterministic
 * briefing. `IntelligenceError` is reserved for the few unrecoverable cases.
 */

import type { AIIssue } from '../core/types';

export type IntelligencePhase = 'analyzing' | 'aggregating' | 'prioritizing' | 'briefing';

export class IntelligenceError extends Error {
  override readonly name = 'IntelligenceError';
  readonly phase: IntelligencePhase;
  readonly issues: readonly AIIssue[];

  constructor(message: string, phase: IntelligencePhase, issues: readonly AIIssue[] = []) {
    super(message);
    this.phase = phase;
    this.issues = issues;
  }
}
