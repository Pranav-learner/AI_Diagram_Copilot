/**
 * The AI layer's typed error family.
 *
 * Mirrors the DSL/engine error style so callers `instanceof`-narrow instead of
 * string-matching. Every failure mode named in the module spec (provider,
 * network, timeout, cancellation, malformed/invalid response, rate limit,
 * config, intent, planning) has a class here. The `retryable` flag lets
 * {@link AIClient} decide mechanically whether an attempt may be retried —
 * transient transport failures are retryable; logic failures are not.
 */

import type { AIIssue } from './types';

export abstract class AIError extends Error {
  /** Whether re-issuing the same request could plausibly succeed. */
  readonly retryable: boolean = false;
  /** The underlying cause, when this error wraps another. */
  override readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.cause = options?.cause;
  }
}

/** The provider returned an error status / payload (carries HTTP status if any). */
export class ProviderError extends AIError {
  readonly provider: string;
  readonly status?: number;
  override readonly retryable: boolean;
  constructor(
    provider: string,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(`[${provider}] ${message}`, { cause: options.cause });
    this.provider = provider;
    this.status = options.status;
    // 5xx and 429 are transient; default other provider errors to non-retryable.
    this.retryable =
      options.retryable ?? (options.status !== undefined && (options.status >= 500 || options.status === 429));
  }
}

/** A network-level failure (DNS, connection reset, fetch threw). Always retryable. */
export class NetworkError extends AIError {
  override readonly retryable = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The request exceeded its per-attempt deadline. Retryable. */
export class TimeoutError extends AIError {
  override readonly retryable = true;
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

/** The caller aborted the request via its {@link AbortSignal}. Never retried. */
export class CancelledError extends AIError {
  override readonly retryable = false;
  constructor(message = 'Request was cancelled') {
    super(message);
  }
}

/** The provider signalled rate limiting (HTTP 429). Retryable, honour `retryAfterMs`. */
export class RateLimitError extends AIError {
  override readonly retryable = true;
  readonly provider: string;
  readonly retryAfterMs?: number;
  constructor(provider: string, retryAfterMs?: number) {
    super(`[${provider}] rate limited`);
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

/** The model's output could not be parsed or failed schema validation. */
export class ResponseValidationError extends AIError {
  override readonly retryable = false;
  readonly issues: readonly string[];
  /** The raw text that failed, truncated for logs. */
  readonly rawText?: string;
  constructor(message: string, issues: readonly string[], rawText?: string) {
    super(message);
    this.issues = issues;
    this.rawText = rawText;
  }
}

/** A misconfiguration (missing api key, unknown provider/model). Not retryable. */
export class AIConfigError extends AIError {
  override readonly retryable = false;
}

/** Intent classification failed or produced an unusable result. */
export class IntentError extends AIError {
  override readonly retryable = false;
}

/**
 * A validated high-level plan could not be compiled into runtime operations
 * (unknown step type, missing compiler, or malformed operation descriptor).
 */
export class PlanningError extends AIError {
  override readonly retryable = false;
  readonly issues: readonly AIIssue[];
  constructor(message: string, issues: readonly AIIssue[] = []) {
    super(message);
    this.issues = issues;
  }
}

/** No provider is registered under the requested id. */
export class ProviderNotFoundError extends AIConfigError {
  constructor(id: string) {
    super(`No AI provider registered with id "${id}"`);
  }
}
