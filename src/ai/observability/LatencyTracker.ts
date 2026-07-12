/**
 * Latency accounting for AI requests.
 *
 * Records durations and reports summary statistics (count, avg, min, max, p50,
 * p95). Kept separate from {@link AIMetrics} so it is independently reusable and
 * testable. Time is injected as an argument (a duration in ms) — the tracker
 * never reads a clock itself, so it stays pure and deterministic under test.
 */

export interface LatencyStats {
  readonly count: number;
  readonly avgMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
}

const EMPTY_STATS: LatencyStats = { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0 };

export class LatencyTracker {
  private readonly samples: number[] = [];
  private sum = 0;

  /** Record one duration in milliseconds. */
  record(durationMs: number): void {
    this.samples.push(durationMs);
    this.sum += durationMs;
  }

  get count(): number {
    return this.samples.length;
  }

  stats(): LatencyStats {
    const n = this.samples.length;
    if (n === 0) return EMPTY_STATS;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return {
      count: n,
      avgMs: this.sum / n,
      minMs: sorted[0]!,
      maxMs: sorted[n - 1]!,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
    };
  }

  reset(): void {
    this.samples.length = 0;
    this.sum = 0;
  }
}

/** Nearest-rank percentile over a pre-sorted array. */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index]!;
}
