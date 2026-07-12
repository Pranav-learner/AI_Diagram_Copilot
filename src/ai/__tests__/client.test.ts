import { describe, it, expect } from 'vitest';
import { AIClient } from '../core/AIClient';
import { MockProvider } from '../providers/MockProvider';
import { NetworkError, TimeoutError, CancelledError, ResponseValidationError } from '../core/AIError';
import type { RetryConfig } from '../core/AIConfig';
import type { ResolvedRequest } from '../core/types';
import { hangingProvider, immediateSleep } from './helpers';

const request: ResolvedRequest = { model: 'm', messages: [{ role: 'user', content: 'hi' }] };
const noJitter: RetryConfig = { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10, backoffFactor: 2, jitter: false };

describe('AIClient retry logic', () => {
  it('retries retryable errors then succeeds', async () => {
    let calls = 0;
    const provider = new MockProvider({
      replies: ['recovered'],
      failure: () => (calls++ < 2 ? new NetworkError('boom') : undefined),
    });
    const attempts: number[] = [];
    const client = new AIClient({ provider, retry: noJitter, sleep: immediateSleep });
    const res = await client.complete(request, { onRetry: (n) => attempts.push(n) });
    expect(res.text).toBe('recovered');
    expect(attempts).toEqual([1, 2]);
  });

  it('gives up after maxRetries and surfaces the last error', async () => {
    const provider = new MockProvider({ failure: () => new NetworkError('always') });
    const client = new AIClient({ provider, retry: noJitter, sleep: immediateSleep });
    await expect(client.complete(request)).rejects.toBeInstanceOf(NetworkError);
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    const provider = new MockProvider({
      failure: () => {
        calls++;
        return new ResponseValidationError('bad', []);
      },
    });
    const client = new AIClient({ provider, retry: noJitter, sleep: immediateSleep });
    await expect(client.complete(request)).rejects.toBeInstanceOf(ResponseValidationError);
    expect(calls).toBe(1);
  });

  it('uses full-jitter backoff with the injected RNG', async () => {
    const delays: number[] = [];
    const provider = new MockProvider({ failure: (_r, i) => (i < 2 ? new NetworkError('x') : undefined), replies: ['ok'] });
    const client = new AIClient({
      provider,
      retry: { maxRetries: 2, initialDelayMs: 100, maxDelayMs: 10_000, backoffFactor: 2, jitter: true },
      random: () => 0.5,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    await client.complete(request);
    // full jitter with random=0.5 → capped/2 + 0.5*capped/2 = 0.75*capped
    expect(delays[0]).toBe(75); // capped=100
    expect(delays[1]).toBe(150); // capped=200
  });
});

describe('AIClient timeouts & cancellation', () => {
  it('times out a hanging request (retryable TimeoutError)', async () => {
    const client = new AIClient({ provider: hangingProvider(), timeoutMs: 10, retry: { ...noJitter, maxRetries: 0 } });
    await expect(client.complete(request)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('rejects immediately with CancelledError for a pre-aborted signal', async () => {
    const client = new AIClient({ provider: hangingProvider(), timeoutMs: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(client.complete(request, { signal: controller.signal })).rejects.toBeInstanceOf(CancelledError);
  });

  it('propagates mid-flight cancellation and does not retry it', async () => {
    const client = new AIClient({ provider: hangingProvider(), timeoutMs: 0, retry: noJitter, sleep: immediateSleep });
    const controller = new AbortController();
    const promise = client.complete(request, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(CancelledError);
  });
});

describe('AIClient streaming', () => {
  it('streams chunks without retrying', async () => {
    const provider = new MockProvider({ replies: ['streamed text'], chunkSize: 4 });
    const client = new AIClient({ provider, timeoutMs: 0 });
    let text = '';
    for await (const chunk of client.stream(request)) text += chunk.delta;
    expect(text).toBe('streamed text');
  });
});
