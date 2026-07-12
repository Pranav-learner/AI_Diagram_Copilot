/**
 * The provider abstraction — the seam that makes the LLM vendor swappable.
 *
 * A provider does exactly one thing: translate a normalized
 * {@link ResolvedRequest} to/from a concrete vendor wire format, and back into
 * a normalized {@link ChatResponse}/{@link StreamChunk} stream. It owns NO
 * policy — no retries, no timeouts, no routing, no metrics. Those live in
 * {@link AIClient}/{@link AIService} above, so every provider benefits from
 * them identically and adding a provider is a small, self-contained mapping.
 *
 * Cancellation is cooperative via a standard {@link AbortSignal}; a provider
 * must abort in-flight work and reject/stop when the signal fires.
 */

import type { ChatResponse, ResolvedRequest, StreamChunk } from './types';

/** What a provider/model supports — lets callers degrade gracefully. */
export interface ProviderCapabilities {
  readonly streaming: boolean;
  /** Native JSON / structured-output mode. */
  readonly jsonMode: boolean;
  /** Whether a dedicated system role is supported (vs. folding into the prompt). */
  readonly systemPrompt: boolean;
  /** Advertised maximum context window in tokens. */
  readonly maxContextTokens: number;
}

export interface AIProvider {
  /** Stable id, e.g. `anthropic`, `openai`, `gemini`, `local`, `mock`. */
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  /** One-shot completion. Rejects with an {@link AIError} subtype on failure. */
  complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse>;

  /**
   * Streamed completion. Yields incremental {@link StreamChunk}s and a terminal
   * `done` chunk. Throwing/rejecting mid-stream surfaces as an {@link AIError}.
   */
  stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk>;
}
