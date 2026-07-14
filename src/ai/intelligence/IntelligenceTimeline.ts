/**
 * IntelligenceTimeline — an append-only log of the insight lifecycle.
 *
 * It turns a {@link RepositoryDiff} into `discovered`/`resolved`/`recurring`
 * events and records user actions (`dismissed`/`accepted`). It is a passive sink
 * with a bounded ring buffer; the Intelligence Engine feeds it and the UI reads
 * `recent()`. Session-scoped — no persistence.
 */

import type { Finding, Severity } from '../review';
import type { RepositoryDiff } from './FindingRepository';
import type { TimelineEvent, TimelineEventKind } from './model/Timeline';

export interface RecordOptions {
  readonly version: number;
  readonly title: string;
  readonly severity?: Severity;
  readonly findingId?: string;
  readonly insightId?: string;
}

export class IntelligenceTimeline {
  private events: TimelineEvent[] = [];
  private seq = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly cap = 500,
  ) {}

  record(kind: TimelineEventKind, opts: RecordOptions): TimelineEvent {
    const event: TimelineEvent = {
      id: `evt_${++this.seq}`,
      kind,
      at: this.now(),
      version: opts.version,
      title: opts.title,
      ...(opts.severity ? { severity: opts.severity } : {}),
      ...(opts.findingId ? { findingId: opts.findingId } : {}),
      ...(opts.insightId ? { insightId: opts.insightId } : {}),
    };
    this.events.push(event);
    if (this.events.length > this.cap) this.events.splice(0, this.events.length - this.cap);
    return event;
  }

  /** Record `discovered`/`resolved`/`recurring` events from a repository diff. */
  recordDiff(diff: RepositoryDiff, version: number): void {
    const add = (kind: TimelineEventKind, f: Finding) => this.record(kind, { version, title: f.title, severity: f.severity, findingId: f.id });
    for (const f of diff.added) add('discovered', f);
    for (const f of diff.recurring) add('recurring', f);
    for (const f of diff.resolved) add('resolved', f);
  }

  recent(n = 20): readonly TimelineEvent[] {
    return this.events.slice(-n).reverse();
  }

  all(): readonly TimelineEvent[] {
    return [...this.events];
  }

  byKind(kind: TimelineEventKind): readonly TimelineEvent[] {
    return this.events.filter((e) => e.kind === kind);
  }

  clear(): void {
    this.events = [];
    this.seq = 0;
  }
}
