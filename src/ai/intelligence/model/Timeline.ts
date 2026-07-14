/**
 * The Intelligence Timeline — an append-only record of the insight lifecycle.
 *
 * Every material change to the finding/insight population is recorded as a
 * {@link TimelineEvent}: a finding discovered, resolved (it disappeared after an
 * edit), or recurring (it came back), plus user actions (dismissed / accepted).
 * The timeline is the substrate for "what changed since I last looked" and for
 * future historical analysis. It is session-scoped (no long-term memory).
 */

import type { Severity } from '../../review';

export type TimelineEventKind = 'discovered' | 'resolved' | 'recurring' | 'dismissed' | 'accepted';

export interface TimelineEvent {
  readonly id: string;
  readonly kind: TimelineEventKind;
  /** Monotonic timestamp (injected clock). */
  readonly at: number;
  /** Graph version the event was recorded at. */
  readonly version: number;
  readonly title: string;
  readonly severity?: Severity;
  /** The finding this event concerns (discovered/resolved/recurring). */
  readonly findingId?: string;
  /** The insight this event concerns (dismissed/accepted). */
  readonly insightId?: string;
}
