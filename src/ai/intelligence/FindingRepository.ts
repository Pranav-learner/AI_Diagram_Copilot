/**
 * FindingRepository — the centralized, stateful store of findings over time.
 *
 * The Static Analysis Engine is stateless: it reports the findings *present now*.
 * This repository gives them a lifecycle. On each analysis it **reconciles** the
 * incoming findings against what it already knows and produces an incremental
 * {@link RepositoryDiff}: which findings are new, which were resolved (they
 * disappeared after an edit), and which are recurring (they came back). It tracks
 * recurrence counts, first/last-seen versions, and user status (dismissed /
 * resolved) — the substrate the Intelligence Engine and timeline reason over.
 *
 * Reconciliation is keyed by the finding's stable id, so re-seeing the same issue
 * is a **duplicate that is suppressed**, never re-announced.
 */

import type { Finding } from '../review';

export type FindingStatus = 'active' | 'resolved' | 'dismissed';

export interface RepositoryEntry {
  readonly finding: Finding;
  readonly status: FindingStatus;
  readonly firstSeenVersion: number;
  readonly firstSeenAt: number;
  readonly lastSeenVersion: number;
  readonly lastSeenAt: number;
  /** How many analyses this finding has appeared in (recurrence signal). */
  readonly seenCount: number;
  /** Times the finding went resolved → active again. */
  readonly reappearances: number;
  readonly resolvedAt?: number;
  readonly dismissedAt?: number;
}

export interface RepositoryDiff {
  readonly added: readonly Finding[];
  readonly resolved: readonly Finding[];
  readonly recurring: readonly Finding[];
  /** Active findings seen again unchanged (no new event emitted). */
  readonly unchanged: number;
  /** Findings whose re-sighting was suppressed (already tracked / dismissed). */
  readonly suppressedDuplicates: number;
}

interface MutableEntry {
  finding: Finding;
  status: FindingStatus;
  firstSeenVersion: number;
  firstSeenAt: number;
  lastSeenVersion: number;
  lastSeenAt: number;
  seenCount: number;
  reappearances: number;
  resolvedAt?: number;
  dismissedAt?: number;
}

export interface RepositoryStats {
  readonly total: number;
  readonly active: number;
  readonly resolved: number;
  readonly dismissed: number;
  readonly recurring: number;
}

export class FindingRepository {
  private readonly entries = new Map<string, MutableEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Reconcile the current findings against the repository at `version`. Returns the
   * incremental diff. Idempotent for an unchanged finding set (no new events).
   */
  update(findings: readonly Finding[], version: number): RepositoryDiff {
    const incoming = new Map(findings.map((f) => [f.id, f]));
    const added: Finding[] = [];
    const resolved: Finding[] = [];
    const recurring: Finding[] = [];
    let unchanged = 0;
    let suppressedDuplicates = 0;
    const t = this.now();

    for (const [id, finding] of incoming) {
      const entry = this.entries.get(id);
      if (!entry) {
        this.entries.set(id, {
          finding,
          status: 'active',
          firstSeenVersion: version,
          firstSeenAt: t,
          lastSeenVersion: version,
          lastSeenAt: t,
          seenCount: 1,
          reappearances: 0,
        });
        added.push(finding);
        continue;
      }
      entry.finding = finding;
      entry.lastSeenVersion = version;
      entry.lastSeenAt = t;
      entry.seenCount += 1;
      if (entry.status === 'dismissed') {
        suppressedDuplicates += 1; // user hid it — stays hidden
      } else if (entry.status === 'resolved') {
        entry.status = 'active';
        entry.reappearances += 1;
        delete entry.resolvedAt;
        recurring.push(finding);
      } else {
        unchanged += 1;
        suppressedDuplicates += 1; // already active — not re-announced
      }
    }

    // Active findings that vanished are now resolved.
    for (const entry of this.entries.values()) {
      if (entry.status === 'active' && !incoming.has(entry.finding.id)) {
        entry.status = 'resolved';
        entry.resolvedAt = t;
        resolved.push(entry.finding);
      }
    }

    return { added, resolved, recurring, unchanged, suppressedDuplicates };
  }

  /** User hides these findings — suppressed even if they recur. */
  dismiss(findingIds: Iterable<string>): void {
    const t = this.now();
    for (const id of findingIds) {
      const entry = this.entries.get(id);
      if (entry) {
        entry.status = 'dismissed';
        entry.dismissedAt = t;
      }
    }
  }

  /**
   * User marks these findings fixed. If a later analysis still detects them, they
   * resurface as *recurring* (a "you said fixed but it's still here" signal).
   */
  markResolved(findingIds: Iterable<string>): void {
    const t = this.now();
    for (const id of findingIds) {
      const entry = this.entries.get(id);
      if (entry && entry.status === 'active') {
        entry.status = 'resolved';
        entry.resolvedAt = t;
      }
    }
  }

  get(id: string): RepositoryEntry | undefined {
    return this.entries.get(id);
  }

  active(): RepositoryEntry[] {
    return [...this.entries.values()].filter((e) => e.status === 'active');
  }

  all(): RepositoryEntry[] {
    return [...this.entries.values()];
  }

  stats(): RepositoryStats {
    let active = 0;
    let resolved = 0;
    let dismissed = 0;
    let recurring = 0;
    for (const e of this.entries.values()) {
      if (e.status === 'active') active++;
      else if (e.status === 'resolved') resolved++;
      else if (e.status === 'dismissed') dismissed++;
      if (e.reappearances > 0) recurring++;
    }
    return { total: this.entries.size, active, resolved, dismissed, recurring };
  }

  clear(): void {
    this.entries.clear();
  }
}
