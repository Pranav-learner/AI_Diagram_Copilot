/**
 * AIMetrics — the observability hub for the AI layer.
 *
 * Every tunable the spec asks to track (latency, token usage, errors, retries,
 * validation failures, provider, model) lands here. It composes
 * {@link LatencyTracker} and {@link TokenTracker} and keeps the categorical
 * counters, exposing one immutable {@link MetricsSnapshot}. It is a passive
 * sink: callers (the service, the validator) push metrics in; nothing here
 * performs I/O or reads a clock, so it is trivially testable and reusable by
 * every future AI feature without change.
 */

import type { ModelId, TokenUsage } from '../core/types';
import { LatencyTracker } from './LatencyTracker';
import type { LatencyStats } from './LatencyTracker';
import { TokenTracker } from './TokenTracker';

/** One completed request's metrics, reported by the service. */
export interface RequestMetric {
  readonly provider: string;
  readonly model: ModelId;
  /** Optional intent label, once features tag requests. */
  readonly intent?: string;
  readonly durationMs: number;
  readonly usage: TokenUsage;
  readonly success: boolean;
  /** Retries consumed before this outcome. */
  readonly retries: number;
  readonly streamed: boolean;
  /** {@link AIError} subclass name when `success` is false. */
  readonly errorType?: string;
}

export interface ProviderStats {
  readonly requests: number;
  readonly failures: number;
}

export interface MetricsSnapshot {
  readonly requests: number;
  readonly successes: number;
  readonly failures: number;
  readonly successRate: number;
  readonly retries: number;
  readonly validationFailures: number;
  readonly latency: LatencyStats;
  readonly tokens: TokenUsage;
  readonly tokensByModel: Readonly<Record<ModelId, TokenUsage>>;
  readonly byProvider: Readonly<Record<string, ProviderStats>>;
  readonly byModel: Readonly<Record<ModelId, number>>;
  readonly errorsByType: Readonly<Record<string, number>>;
}

export class AIMetrics {
  private readonly latency = new LatencyTracker();
  private readonly tokens = new TokenTracker();

  private requests = 0;
  private successes = 0;
  private retries = 0;
  private validationFailures = 0;

  private readonly providerStats = new Map<string, { requests: number; failures: number }>();
  private readonly modelCounts = new Map<ModelId, number>();
  private readonly errorCounts = new Map<string, number>();

  /** Record one completed request (success or failure). */
  record(metric: RequestMetric): void {
    this.requests += 1;
    this.retries += metric.retries;
    this.latency.record(metric.durationMs);
    this.tokens.record(metric.model, metric.usage);
    bump(this.modelCounts, metric.model);

    const provider = this.providerStats.get(metric.provider) ?? { requests: 0, failures: 0 };
    provider.requests += 1;
    if (metric.success) this.successes += 1;
    else {
      provider.failures += 1;
      if (metric.errorType) bump(this.errorCounts, metric.errorType);
    }
    this.providerStats.set(metric.provider, provider);
  }

  /** Record a response that failed schema/semantic validation. */
  recordValidationFailure(): void {
    this.validationFailures += 1;
  }

  snapshot(): MetricsSnapshot {
    return {
      requests: this.requests,
      successes: this.successes,
      failures: this.requests - this.successes,
      successRate: this.requests === 0 ? 0 : this.successes / this.requests,
      retries: this.retries,
      validationFailures: this.validationFailures,
      latency: this.latency.stats(),
      tokens: this.tokens.totals,
      tokensByModel: this.tokens.breakdown(),
      byProvider: Object.fromEntries(this.providerStats),
      byModel: Object.fromEntries(this.modelCounts),
      errorsByType: Object.fromEntries(this.errorCounts),
    };
  }

  reset(): void {
    this.latency.reset();
    this.tokens.reset();
    this.requests = 0;
    this.successes = 0;
    this.retries = 0;
    this.validationFailures = 0;
    this.providerStats.clear();
    this.modelCounts.clear();
    this.errorCounts.clear();
  }
}

function bump<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** A metrics instance that records nothing — the default when observability is off. */
export const noopMetrics = new (class extends AIMetrics {
  override record(): void {}
  override recordValidationFailure(): void {}
})();
