/**
 * Google Gemini provider — generateContent API.
 *
 * Gemini's shape differs most from the others: system turns go in
 * `system_instruction`, message roles are `user`/`model` (assistant → model),
 * and content is a list of `parts`. The api key travels as a query parameter.
 * Streaming uses `:streamGenerateContent?alt=sse`, each SSE event being a full
 * `GenerateContentResponse` JSON.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import type { ChatMessage, ChatResponse, FinishReason, ResolvedRequest, StreamChunk } from '../core/types';
import { parseSSE } from './http';
import type { HttpProviderConfig } from './base';
import { raiseForStatus, requireKey, resolveTransport } from './base';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    jsonMode: true,
    systemPrompt: true,
    maxContextTokens: 1_000_000,
  };

  constructor(private readonly config: HttpProviderConfig = {}) {}

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const res = await this.post(request, 'generateContent', signal);
    if (!res.ok) return raiseForStatus(this.id, res);
    const json = JSON.parse(await res.text()) as GeminiResponse;
    const candidate = json.candidates?.[0];
    return {
      text: extractText(candidate),
      finishReason: mapFinish(candidate?.finishReason),
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: json.usageMetadata?.totalTokenCount ?? 0,
      },
      raw: json,
    };
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const res = await this.post(request, 'streamGenerateContent', signal, true);
    if (!res.ok) return raiseForStatus(this.id, res);

    let finishReason: FinishReason = 'stop';
    let usage: GeminiResponse['usageMetadata'];
    for await (const data of parseSSE(res.stream())) {
      const event = safeParse<GeminiResponse>(data);
      const candidate = event?.candidates?.[0];
      if (!candidate) continue;
      if (candidate.finishReason) finishReason = mapFinish(candidate.finishReason);
      if (event?.usageMetadata) usage = event.usageMetadata;
      const text = extractText(candidate);
      if (text) yield { delta: text, done: false };
    }
    yield {
      delta: '',
      done: true,
      finishReason,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }

  private post(request: ResolvedRequest, method: string, signal?: AbortSignal, sse = false) {
    const key = requireKey(this.id, this.config);
    const baseURL = this.config.baseURL ?? DEFAULT_BASE_URL;
    const query = sse ? '?alt=sse' : '';
    return resolveTransport(this.config)({
      url: `${baseURL}/v1beta/models/${request.model}:${method}${query}`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, ...this.config.headers },
      body: JSON.stringify(this.body(request)),
      signal,
    });
  }

  private body(request: ResolvedRequest) {
    const { system, turns } = split(request.messages);
    return {
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      contents: turns.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        topP: request.topP,
        stopSequences: request.stop,
        responseMimeType: request.responseFormat?.type === 'json' ? 'application/json' : undefined,
      },
    };
  }
}

function split(messages: readonly ChatMessage[]): { system: string; turns: ChatMessage[] } {
  const systemParts: string[] = [];
  const turns: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'developer') systemParts.push(m.content);
    else turns.push(m);
  }
  return { system: systemParts.join('\n\n'), turns };
}

function extractText(candidate: GeminiCandidate | undefined): string {
  if (!candidate?.content?.parts) return '';
  return candidate.content.parts.map((p) => p.text ?? '').join('');
}

function mapFinish(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
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

interface GeminiCandidate {
  readonly content?: { parts?: ReadonlyArray<{ text?: string }> };
  readonly finishReason?: string | null;
}
interface GeminiResponse {
  readonly candidates?: ReadonlyArray<GeminiCandidate>;
  readonly usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Convenience factory. */
export function geminiProvider(config?: HttpProviderConfig): GeminiProvider {
  return new GeminiProvider(config);
}
