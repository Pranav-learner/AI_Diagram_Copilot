import { describe, it, expect } from 'vitest';
import { AIMetrics } from '../observability/AIMetrics';
import { LatencyTracker } from '../observability/LatencyTracker';
import { TokenTracker } from '../observability/TokenTracker';

describe('LatencyTracker', () => {
  it('computes summary statistics', () => {
    const t = new LatencyTracker();
    [10, 20, 30, 40, 100].forEach((d) => t.record(d));
    const s = t.stats();
    expect(s.count).toBe(5);
    expect(s.minMs).toBe(10);
    expect(s.maxMs).toBe(100);
    expect(s.p50Ms).toBe(30);
    expect(s.p95Ms).toBe(100);
  });
  it('returns zeroed stats when empty', () => {
    expect(new LatencyTracker().stats().count).toBe(0);
  });
});

describe('TokenTracker', () => {
  it('aggregates usage overall and per model', () => {
    const t = new TokenTracker();
    t.record('a', { promptTokens: 1, completionTokens: 2, totalTokens: 3 });
    t.record('a', { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    t.record('b', { promptTokens: 5, completionTokens: 0, totalTokens: 5 });
    expect(t.totals.totalTokens).toBe(10);
    expect(t.forModel('a').totalTokens).toBe(5);
    expect(Object.keys(t.breakdown()).sort()).toEqual(['a', 'b']);
  });
});

describe('AIMetrics', () => {
  it('aggregates requests, success rate, retries, providers, and errors', () => {
    const m = new AIMetrics();
    m.record({ provider: 'anthropic', model: 'x', durationMs: 10, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, success: true, retries: 1, streamed: false });
    m.record({ provider: 'anthropic', model: 'x', durationMs: 20, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, success: false, retries: 2, streamed: false, errorType: 'TimeoutError' });
    m.recordValidationFailure();

    const s = m.snapshot();
    expect(s.requests).toBe(2);
    expect(s.successes).toBe(1);
    expect(s.successRate).toBe(0.5);
    expect(s.retries).toBe(3);
    expect(s.validationFailures).toBe(1);
    expect(s.tokens.totalTokens).toBe(2);
    expect(s.byProvider['anthropic']).toEqual({ requests: 2, failures: 1 });
    expect(s.errorsByType['TimeoutError']).toBe(1);
    expect(s.latency.avgMs).toBe(15);
  });
});
