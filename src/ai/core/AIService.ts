/**
 * AIService — the single front door to the model layer.
 *
 * Everything above (prompt builder, planner, conversation, features) calls the
 * service, never a provider or client directly. It composes the pieces:
 *   route (ModelRouter) → resolve provider (ProviderRegistry) → execute with
 *   resilience (AIClient) → measure & record (AIMetrics) → return normalized.
 *
 * It owns model *resolution* (tier → concrete model + sampling defaults, with
 * per-request overrides) and observability wiring, so those concerns exist once
 * for every current and future capability. Time is injected (`now`) so latency
 * metrics are deterministic under test.
 */

import type { ChatRequest, ChatResponse, ResolvedRequest, StreamChunk, TokenUsage } from './types';
import { ZERO_USAGE } from './types';
import type { AIConfig } from './AIConfig';
import { defaultAIConfig } from './AIConfig';
import { AIError } from './AIError';
import { AIClient } from './AIClient';
import type { Sleeper } from './AIClient';
import type { ModelRouter, RoutingHint } from './ModelRouter';
import { DefaultModelRouter } from './ModelRouter';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { Logger } from '../observability/Logger';
import { noopLogger } from '../observability/Logger';
import { AIMetrics, noopMetrics } from '../observability/AIMetrics';

export interface AIServiceDeps {
  readonly registry: ProviderRegistry;
  readonly config?: AIConfig;
  readonly metrics?: AIMetrics;
  readonly logger?: Logger;
  readonly router?: ModelRouter;
  /** Injected clock for latency measurement (defaults to `Date.now`). */
  readonly now?: () => number;
  /** Forwarded to {@link AIClient} for deterministic retry tests. */
  readonly sleep?: Sleeper;
  readonly random?: () => number;
}

/** Per-request options: routing hints, cancellation, and an intent tag. */
export interface AIRequestOptions extends RoutingHint {
  readonly signal?: AbortSignal;
}

export class AIService {
  readonly config: AIConfig;
  readonly metrics: AIMetrics;
  private readonly registry: ProviderRegistry;
  private readonly logger: Logger;
  private readonly router: ModelRouter;
  private readonly now: () => number;
  private readonly sleep?: Sleeper;
  private readonly random?: () => number;

  constructor(deps: AIServiceDeps) {
    this.registry = deps.registry;
    this.config = deps.config ?? defaultAIConfig;
    this.metrics = deps.metrics ?? noopMetrics;
    this.logger = deps.logger ?? noopLogger;
    this.router = deps.router ?? new DefaultModelRouter(this.config);
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep;
    this.random = deps.random;
  }

  /** Execute a completion end-to-end: route, run with resilience, record. */
  async complete(request: ChatRequest, opts: AIRequestOptions = {}): Promise<ChatResponse> {
    const { client, resolved, route } = this.prepare(request, opts);
    const start = this.now();
    let retries = 0;
    try {
      const response = await client.complete(resolved, {
        signal: opts.signal,
        onRetry: () => {
          retries += 1;
        },
      });
      this.record(route.provider, resolved.model, opts.intent, start, response.usage, true, retries, false);
      return response;
    } catch (err) {
      this.recordFailure(route.provider, resolved.model, opts.intent, start, retries, false, err);
      throw err;
    }
  }

  /**
   * Execute a streamed completion. Yields chunks as they arrive; records the
   * aggregate metric once the stream ends (or fails).
   */
  async *stream(request: ChatRequest, opts: AIRequestOptions = {}): AsyncIterable<StreamChunk> {
    const { client, resolved, route } = this.prepare(request, opts);
    const start = this.now();
    let usage: TokenUsage = ZERO_USAGE;
    try {
      for await (const chunk of client.stream(resolved, { signal: opts.signal })) {
        if (chunk.usage) usage = chunk.usage;
        yield chunk;
      }
      this.record(route.provider, resolved.model, opts.intent, start, usage, true, 0, true);
    } catch (err) {
      this.recordFailure(route.provider, resolved.model, opts.intent, start, 0, true, err);
      throw err;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private prepare(request: ChatRequest, opts: AIRequestOptions) {
    const route = this.router.route(opts);
    const provider = this.registry.get(route.provider);
    const resolved = resolveRequest(request, route);
    const client = new AIClient({
      provider,
      retry: this.config.retry,
      timeoutMs: this.config.timeoutMs,
      logger: this.logger,
      sleep: this.sleep,
      random: this.random,
    });
    return { client, resolved, route };
  }

  private record(
    provider: string,
    model: string,
    intent: string | undefined,
    start: number,
    usage: TokenUsage,
    success: boolean,
    retries: number,
    streamed: boolean,
  ): void {
    this.metrics.record({
      provider,
      model,
      intent,
      durationMs: this.now() - start,
      usage,
      success,
      retries,
      streamed,
    });
  }

  private recordFailure(
    provider: string,
    model: string,
    intent: string | undefined,
    start: number,
    retries: number,
    streamed: boolean,
    err: unknown,
  ): void {
    this.metrics.record({
      provider,
      model,
      intent,
      durationMs: this.now() - start,
      usage: ZERO_USAGE,
      success: false,
      retries,
      streamed,
      errorType: err instanceof AIError ? err.name : 'UnknownError',
    });
  }
}

/** Merge request params over the routed model's sampling defaults. */
function resolveRequest(request: ChatRequest, route: { model: { model: string; temperature: number; maxTokens: number } }): ResolvedRequest {
  return {
    messages: request.messages,
    model: route.model.model,
    temperature: request.temperature ?? route.model.temperature,
    maxTokens: request.maxTokens ?? route.model.maxTokens,
    topP: request.topP,
    stop: request.stop,
    responseFormat: request.responseFormat,
  };
}
