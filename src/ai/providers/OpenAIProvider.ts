/**
 * OpenAI provider — Chat Completions API.
 *
 * The role model maps almost 1:1; `developer` is folded to `system` for broad
 * endpoint compatibility. `responseFormat.type === 'json'` sets the native
 * `response_format` JSON mode. Streaming consumes `data:` SSE lines terminated
 * by `data: [DONE]`. The wire mapping is factored so the OpenAI-compatible
 * {@link LocalProvider} can reuse it verbatim.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import type { ChatMessage, ChatResponse, FinishReason, ResolvedRequest, StreamChunk } from '../core/types';
import { parseSSE } from './http';
import type { HttpProviderConfig } from './base';
import { raiseForStatus, requireKey, resolveTransport } from './base';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export interface OpenAICompatibleOptions extends HttpProviderConfig {
  /** Provider id, so OpenAI-compatible backends can present a distinct identity. */
  readonly id?: string;
  /** Whether an api key is mandatory (local backends often need none). */
  readonly requireApiKey?: boolean;
  readonly maxContextTokens?: number;
}

export class OpenAIProvider implements AIProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  constructor(private readonly config: OpenAICompatibleOptions = {}) {
    this.id = config.id ?? 'openai';
    this.capabilities = {
      streaming: true,
      jsonMode: true,
      systemPrompt: true,
      maxContextTokens: config.maxContextTokens ?? 128_000,
    };
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const res = await this.post(this.body(request, false), signal);
    if (!res.ok) return raiseForStatus(this.id, res);
    const json = JSON.parse(await res.text()) as OpenAICompletion;
    const choice = json.choices?.[0];
    return {
      text: choice?.message?.content ?? '',
      finishReason: mapFinish(choice?.finish_reason),
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
      raw: json,
    };
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const res = await this.post(this.body(request, true), signal);
    if (!res.ok) return raiseForStatus(this.id, res);

    let finishReason: FinishReason = 'stop';
    for await (const data of parseSSE(res.stream())) {
      if (data === '[DONE]') break;
      const event = safeParse<OpenAIStreamChunk>(data);
      const choice = event?.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = mapFinish(choice.finish_reason);
      const delta = choice.delta?.content;
      if (delta) yield { delta, done: false };
    }
    yield { delta: '', done: true, finishReason };
  }

  private post(body: unknown, signal?: AbortSignal) {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...this.config.headers };
    const needsKey = this.config.requireApiKey ?? true;
    const key = needsKey ? requireKey(this.id, this.config) : this.config.apiKey;
    if (key) headers['authorization'] = `Bearer ${key}`;

    return resolveTransport(this.config)({
      url: `${this.config.baseURL ?? DEFAULT_BASE_URL}/chat/completions`,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  }

  private body(request: ResolvedRequest, stream: boolean) {
    return {
      model: request.model,
      messages: request.messages.map(toOpenAIMessage),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      stop: request.stop,
      response_format: request.responseFormat?.type === 'json' ? { type: 'json_object' } : undefined,
      stream,
    };
  }
}

function toOpenAIMessage(m: ChatMessage): { role: string; content: string; name?: string } {
  const role = m.role === 'developer' ? 'system' : m.role;
  return m.name ? { role, content: m.content, name: m.name } : { role, content: m.content };
}

function mapFinish(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    case 'tool_calls':
    case 'function_call':
      return 'tool_call';
    default:
      return 'stop';
  }
}

function safeParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

interface OpenAICompletion {
  readonly choices?: ReadonlyArray<{ message?: { content?: string }; finish_reason?: string | null }>;
  readonly usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
interface OpenAIStreamChunk {
  readonly choices?: ReadonlyArray<{ delta?: { content?: string }; finish_reason?: string | null }>;
}

/** Convenience factory. */
export function openAIProvider(config?: OpenAICompatibleOptions): OpenAIProvider {
  return new OpenAIProvider(config);
}
