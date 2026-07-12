/**
 * AIClient — resilience policy around a single {@link AIProvider}.
 *
 * Providers are pure mappings; all cross-cutting reliability concerns live here
 * so every provider inherits them identically:
 *   • timeouts   — a per-attempt deadline via a linked {@link AbortController};
 *   • cancellation — cooperative, through the caller's {@link AbortSignal};
 *   • retries    — exponential backoff with jitter, but *only* for errors the
 *                  {@link AIError} family marks `retryable` (transient transport
 *                  failures), never for logic failures or caller cancellation.
 *
 * Determinism for tests is preserved by injecting `sleep` and `random`; the
 * client never reads a wall clock itself.
 */

import type { AIProvider } from './AIProvider';
import type { ChatResponse, ResolvedRequest, StreamChunk } from './types';
import type { RetryConfig } from './AIConfig';
import { defaultAIConfig } from './AIConfig';
import { AIError, CancelledError, ProviderError, TimeoutError, RateLimitError } from './AIError';
import type { Logger } from '../observability/Logger';
import { noopLogger } from '../observability/Logger';

/** Injected sleeper — resolves after `ms`, rejects with CancelledError on abort. */
export type Sleeper = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface AIClientDeps {
  readonly provider: AIProvider;
  readonly retry?: RetryConfig;
  /** Per-attempt deadline in ms; 0 disables. */
  readonly timeoutMs?: number;
  readonly logger?: Logger;
  readonly sleep?: Sleeper;
  /** RNG in [0,1) for jitter. Injectable for deterministic tests. */
  readonly random?: () => number;
}

export interface CallOptions {
  readonly signal?: AbortSignal;
  /** Invoked before each retry with the (1-based) attempt number and the cause. */
  readonly onRetry?: (attempt: number, error: AIError) => void;
}

export class AIClient {
  readonly provider: AIProvider;
  private readonly retry: RetryConfig;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly sleep: Sleeper;
  private readonly random: () => number;

  constructor(deps: AIClientDeps) {
    this.provider = deps.provider;
    this.retry = deps.retry ?? defaultAIConfig.retry;
    this.timeoutMs = deps.timeoutMs ?? defaultAIConfig.timeoutMs;
    this.logger = deps.logger ?? noopLogger;
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? Math.random;
  }

  /** One-shot completion with timeout + retry. */
  async complete(request: ResolvedRequest, opts: CallOptions = {}): Promise<ChatResponse> {
    let attempt = 0;
    for (;;) {
      try {
        return await runWithDeadline(
          (signal) => this.provider.complete(request, signal),
          opts.signal,
          this.timeoutMs,
          this.provider.id,
        );
      } catch (err) {
        const aiErr = toAIError(err, this.provider.id);
        if (!aiErr.retryable || attempt >= this.retry.maxRetries) throw aiErr;
        attempt += 1;
        const delay = backoffDelay(this.retry, attempt, this.random, aiErr);
        this.logger.log('warn', 'ai request retry', {
          provider: this.provider.id,
          attempt,
          delayMs: delay,
          error: aiErr.name,
        });
        opts.onRetry?.(attempt, aiErr);
        await this.sleep(delay, opts.signal);
      }
    }
  }

  /**
   * Streamed completion. Deliberately **not retried** — a partially-consumed
   * stream cannot be safely replayed. The timeout bounds *time-to-first-chunk*
   * (connection + first token); once data flows the deadline is cleared so long
   * legitimate streams are not killed. Cancellation applies throughout.
   */
  async *stream(request: ResolvedRequest, opts: CallOptions = {}): AsyncIterable<StreamChunk> {
    if (opts.signal?.aborted) throw new CancelledError();
    const deadline = new Deadline(opts.signal, this.timeoutMs, this.provider.id);
    try {
      const iterator = this.provider.stream(request, deadline.signal);
      let first = true;
      for await (const chunk of iterator) {
        if (first) {
          deadline.clearTimer(); // time-to-first-chunk satisfied
          first = false;
        }
        yield chunk;
      }
    } catch (err) {
      throw deadline.translate(err);
    } finally {
      deadline.dispose();
    }
  }
}

// ── Deadline / cancellation plumbing ────────────────────────────────────────

/**
 * A linked abort controller with a timeout timer. Distinguishes *our* timeout
 * abort from the *caller's* cancellation so the surfaced error is correct
 * (retryable {@link TimeoutError} vs terminal {@link CancelledError}).
 */
class Deadline {
  readonly controller = new AbortController();
  private timedOut = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly onAbort = () => this.controller.abort();

  constructor(
    private readonly callerSignal: AbortSignal | undefined,
    private readonly timeoutMs: number,
    private readonly providerId: string,
  ) {
    callerSignal?.addEventListener('abort', this.onAbort);
    if (timeoutMs > 0) {
      this.timer = setTimeout(() => {
        this.timedOut = true;
        this.controller.abort();
      }, timeoutMs);
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Map a raw error to the right AIError given who aborted. */
  translate(err: unknown): AIError {
    if (this.timedOut) return new TimeoutError(this.timeoutMs);
    if (this.callerSignal?.aborted) return new CancelledError();
    return toAIError(err, this.providerId);
  }

  dispose(): void {
    this.clearTimer();
    this.callerSignal?.removeEventListener('abort', this.onAbort);
  }
}

async function runWithDeadline<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  providerId: string,
): Promise<T> {
  if (callerSignal?.aborted) throw new CancelledError();
  const deadline = new Deadline(callerSignal, timeoutMs, providerId);
  try {
    return await fn(deadline.signal);
  } catch (err) {
    throw deadline.translate(err);
  } finally {
    deadline.dispose();
  }
}

/** Coerce any thrown value into an {@link AIError}. Unknown throws are non-retryable. */
export function toAIError(err: unknown, providerId: string): AIError {
  if (err instanceof AIError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError(providerId, message, { retryable: false, cause: err });
}

/** Compute the backoff delay for an attempt, honouring an explicit retry-after. */
function backoffDelay(retry: RetryConfig, attempt: number, random: () => number, error: AIError): number {
  if (error instanceof RateLimitError && error.retryAfterMs !== undefined) return error.retryAfterMs;
  const base = retry.initialDelayMs * Math.pow(retry.backoffFactor, attempt - 1);
  const capped = Math.min(base, retry.maxDelayMs);
  if (!retry.jitter) return capped;
  // Full jitter: uniform in [capped/2, capped].
  return Math.round(capped / 2 + random() * (capped / 2));
}

const defaultSleep: Sleeper = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new CancelledError());
    });
  });
