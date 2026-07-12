import { describe, it, expect, vi } from 'vitest';
import { MockProvider } from '../providers/MockProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { RateLimitError, ProviderNotFoundError, AIConfigError } from '../core/AIError';
import type { ResolvedRequest } from '../core/types';
import { jsonResponse, sseResponse } from './helpers';

const request: ResolvedRequest = {
  model: 'm',
  messages: [
    { role: 'system', content: 'be terse' },
    { role: 'user', content: 'hello' },
  ],
};

describe('MockProvider (provider abstraction)', () => {
  it('echoes the last user message by default and records calls', async () => {
    const p = new MockProvider();
    const res = await p.complete(request);
    expect(res.text).toBe('hello');
    expect(res.provider).toBe('mock');
    expect(res.usage.totalTokens).toBeGreaterThan(0);
    expect(p.calls).toHaveLength(1);
  });

  it('serves canned replies then falls back to a responder', async () => {
    const p = new MockProvider({ replies: ['first'], responder: () => 'computed' });
    expect((await p.complete(request)).text).toBe('first');
    expect((await p.complete(request)).text).toBe('computed');
  });

  it('streams the reply in chunks that reconstruct the whole text', async () => {
    const p = new MockProvider({ replies: ['abcdefgh'], chunkSize: 3 });
    let text = '';
    let done = false;
    for await (const chunk of p.stream(request)) {
      text += chunk.delta;
      done = chunk.done || done;
    }
    expect(text).toBe('abcdefgh');
    expect(done).toBe(true);
  });
});

describe('ProviderRegistry', () => {
  it('resolves registered providers and throws for unknown ones', () => {
    const registry = new ProviderRegistry().register(new MockProvider());
    expect(registry.get('mock').id).toBe('mock');
    expect(() => registry.get('nope')).toThrow(ProviderNotFoundError);
  });
});

describe('AnthropicProvider (wire mapping over injected transport)', () => {
  it('hoists system turns and maps the response', async () => {
    let captured: unknown;
    const transport = vi.fn(async (req: { body?: string }) => {
      captured = JSON.parse(req.body ?? '{}');
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'hi there' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 3 },
      });
    });
    const provider = new AnthropicProvider({ apiKey: 'k', transport });
    const res = await provider.complete(request);

    expect(res.text).toBe('hi there');
    expect(res.finishReason).toBe('stop');
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 3, totalTokens: 13 });
    expect((captured as { system: string }).system).toBe('be terse');
    expect((captured as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it('maps 429 to RateLimitError and 500 to a retryable ProviderError', async () => {
    const rate = new AnthropicProvider({ apiKey: 'k', transport: async () => jsonResponse(429, {}) });
    await expect(rate.complete(request)).rejects.toBeInstanceOf(RateLimitError);

    const server = new AnthropicProvider({ apiKey: 'k', transport: async () => jsonResponse(500, {}) });
    await expect(server.complete(request)).rejects.toMatchObject({ name: 'ProviderError', retryable: true });
  });

  it('requires an api key', async () => {
    await expect(new AnthropicProvider().complete(request)).rejects.toBeInstanceOf(AIConfigError);
  });

  it('streams SSE deltas', async () => {
    const events = [
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5 } } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }),
      JSON.stringify({ type: 'message_stop' }),
    ];
    const provider = new AnthropicProvider({ apiKey: 'k', transport: async () => sseResponse(events) });
    let text = '';
    let usageTotal = 0;
    for await (const chunk of provider.stream(request)) {
      text += chunk.delta;
      if (chunk.usage) usageTotal = chunk.usage.totalTokens;
    }
    expect(text).toBe('Hello');
    expect(usageTotal).toBe(7);
  });
});

describe('OpenAIProvider', () => {
  it('maps chat completions and folds developer→system', async () => {
    let captured: { messages: Array<{ role: string }> } | undefined;
    const provider = new OpenAIProvider({
      apiKey: 'k',
      transport: async (req) => {
        captured = JSON.parse(req.body ?? '{}');
        return jsonResponse(200, {
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        });
      },
    });
    const res = await provider.complete({ ...request, messages: [{ role: 'developer', content: 'd' }, ...request.messages] });
    expect(res.text).toBe('ok');
    expect(res.usage.totalTokens).toBe(5);
    expect(captured!.messages[0]!.role).toBe('system');
  });
});
