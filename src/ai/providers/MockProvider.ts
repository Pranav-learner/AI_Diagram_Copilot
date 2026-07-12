/**
 * A deterministic, network-free provider.
 *
 * This is the default provider when no real key is configured and the backbone
 * of the test suite: it lets us exercise the *entire* pipeline (prompt → service
 * → validation → planning) with fully predictable output, and simulate every
 * failure mode ({@link AIError}) and streaming behaviour without touching a
 * network. It is a first-class citizen, not a stub — the abstraction is only
 * proven if a non-HTTP provider drops in with zero changes elsewhere.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import type { AIError } from '../core/AIError';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, FinishReason, ResolvedRequest, StreamChunk, TokenUsage } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';

export interface MockReply {
  readonly text: string;
  readonly finishReason?: FinishReason;
  readonly usage?: Partial<TokenUsage>;
}

export type MockResponder = (request: ResolvedRequest) => string | MockReply | Promise<string | MockReply>;

export interface MockProviderOptions {
  readonly id?: string;
  /** Computes a reply from the request. Defaults to echoing the last user turn. */
  readonly responder?: MockResponder;
  /** A FIFO queue of canned replies, consumed before `responder`/echo kicks in. */
  readonly replies?: ReadonlyArray<string | MockReply>;
  /** Characters per streamed chunk. */
  readonly chunkSize?: number;
  readonly capabilities?: Partial<ProviderCapabilities>;
  /** Return an error to simulate a failure on a given call (0-based index). */
  readonly failure?: (request: ResolvedRequest, callIndex: number) => AIError | undefined;
}

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  jsonMode: true,
  systemPrompt: true,
  maxContextTokens: 200_000,
};

export class MockProvider implements AIProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  /** Every request received, in order — for test assertions. */
  readonly calls: ResolvedRequest[] = [];

  private readonly options: MockProviderOptions;
  private readonly queue: Array<string | MockReply>;
  private callIndex = 0;

  constructor(options: MockProviderOptions = {}) {
    this.options = options;
    this.id = options.id ?? 'mock';
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities };
    this.queue = [...(options.replies ?? [])];
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    throwIfAborted(signal);
    const index = this.callIndex++;
    this.calls.push(request);

    const failure = this.options.failure?.(request, index);
    if (failure) throw failure;

    const reply = await this.resolveReply(request);
    return this.toResponse(request, reply);
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    // Reuse complete() for call recording/failure/reply resolution.
    const response = await this.complete(request, signal);
    const size = Math.max(1, this.options.chunkSize ?? 16);
    const text = response.text;
    for (let i = 0; i < text.length; i += size) {
      throwIfAborted(signal);
      yield { delta: text.slice(i, i + size), done: false };
    }
    yield { delta: '', done: true, finishReason: response.finishReason, usage: response.usage };
  }

  private async resolveReply(request: ResolvedRequest): Promise<MockReply> {
    if (this.queue.length > 0) return normalizeReply(this.queue.shift()!);
    if (this.options.responder) return normalizeReply(await this.options.responder(request));
    // Default: echo the last user message — deterministic and inspectable.
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    return { text: lastUser?.content ?? '' };
  }

  private toResponse(request: ResolvedRequest, reply: MockReply): ChatResponse {
    const promptTokens = reply.usage?.promptTokens ?? estimateMessagesTokens(request.messages);
    const completionTokens = reply.usage?.completionTokens ?? estimateTokens(reply.text);
    return {
      text: reply.text,
      finishReason: reply.finishReason ?? 'stop',
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: reply.usage?.totalTokens ?? promptTokens + completionTokens,
      },
    };
  }
}

function normalizeReply(reply: string | MockReply): MockReply {
  return typeof reply === 'string' ? { text: reply } : reply;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError();
}
