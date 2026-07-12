/**
 * Anthropic (Claude) provider — the platform's primary provider.
 *
 * Maps the normalized request onto the Messages API: the `system`/`developer`
 * turns are hoisted into Anthropic's top-level `system` string (Claude has no
 * inline system role), and the remaining turns become `user`/`assistant`
 * messages. Streaming consumes the SSE event protocol
 * (`content_block_delta` → text, `message_delta` → usage/stop).
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import type { ChatMessage, ChatResponse, FinishReason, ResolvedRequest, StreamChunk } from '../core/types';
import { parseSSE } from './http';
import type { HttpProviderConfig } from './base';
import { raiseForStatus, requireKey, resolveTransport } from './base';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    jsonMode: false, // Constrained via prompt + validation, not a native flag.
    systemPrompt: true,
    maxContextTokens: 200_000,
  };

  constructor(private readonly config: HttpProviderConfig = {}) {}

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const res = await this.post(this.body(request, false), signal);
    if (!res.ok) return raiseForStatus(this.id, res);
    const json = JSON.parse(await res.text()) as AnthropicMessage;
    return {
      text: extractText(json),
      finishReason: mapStop(json.stop_reason),
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: json.usage?.input_tokens ?? 0,
        completionTokens: json.usage?.output_tokens ?? 0,
        totalTokens: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
      },
      raw: json,
    };
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const res = await this.post(this.body(request, true), signal);
    if (!res.ok) return raiseForStatus(this.id, res);

    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: FinishReason = 'stop';

    for await (const data of parseSSE(res.stream())) {
      const event = safeParse<AnthropicStreamEvent>(data);
      if (!event) continue;
      if (event.type === 'message_start') {
        promptTokens = event.message?.usage?.input_tokens ?? 0;
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { delta: event.delta.text ?? '', done: false };
      } else if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) finishReason = mapStop(event.delta.stop_reason);
        if (event.usage?.output_tokens) completionTokens = event.usage.output_tokens;
      } else if (event.type === 'message_stop') {
        break;
      }
    }
    yield {
      delta: '',
      done: true,
      finishReason,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    };
  }

  private post(body: unknown, signal?: AbortSignal) {
    const key = requireKey(this.id, this.config);
    const baseURL = this.config.baseURL ?? DEFAULT_BASE_URL;
    return resolveTransport(this.config)({
      url: `${baseURL}/v1/messages`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        ...this.config.headers,
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  private body(request: ResolvedRequest, stream: boolean) {
    const { system, turns } = splitSystem(request.messages);
    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: request.stop,
      system: system || undefined,
      messages: turns.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      stream,
    };
  }
}

/** Hoist system/developer turns into a single system string; keep the rest. */
function splitSystem(messages: readonly ChatMessage[]): { system: string; turns: ChatMessage[] } {
  const systemParts: string[] = [];
  const turns: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'developer') systemParts.push(m.content);
    else turns.push(m);
  }
  return { system: systemParts.join('\n\n'), turns };
}

function extractText(msg: AnthropicMessage): string {
  if (!msg.content) return '';
  return msg.content
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function mapStop(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
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

// ── Minimal shapes of the Anthropic wire format we consume ──────────────────
interface AnthropicTextBlock {
  readonly type: 'text';
  readonly text: string;
}
interface AnthropicMessage {
  readonly content?: ReadonlyArray<AnthropicTextBlock | { type: string }>;
  readonly stop_reason?: string | null;
  readonly usage?: { input_tokens?: number; output_tokens?: number };
}
interface AnthropicStreamEvent {
  readonly type: string;
  readonly message?: { usage?: { input_tokens?: number } };
  readonly delta?: { type?: string; text?: string; stop_reason?: string };
  readonly usage?: { output_tokens?: number };
}

/** Convenience factory. */
export function anthropicProvider(config?: HttpProviderConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}
