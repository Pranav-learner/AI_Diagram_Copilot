import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider } from '../providers/GeminiProvider';
import { RateLimitError, ProviderError, AIConfigError } from '../core/AIError';
import type { ResolvedRequest } from '../core/types';
import { jsonResponse, sseResponse } from './helpers';

const request: ResolvedRequest = {
  model: 'gemini-1.5-pro',
  messages: [
    { role: 'system', content: 'You are an architecture assistant.' },
    { role: 'user', content: 'Summarize the backend.' },
  ],
  temperature: 0.2,
  maxTokens: 2048,
};

describe('GeminiProvider', () => {
  it('successfully maps generateContent requests and parses Gemini JSON responses', async () => {
    let capturedBody: any;
    let capturedUrl = '';

    const transport = vi.fn(async (req: { url: string; body?: string }) => {
      capturedUrl = req.url;
      capturedBody = JSON.parse(req.body ?? '{}');
      return jsonResponse(200, {
        candidates: [
          {
            content: { parts: [{ text: '{"summary": "FastAPI service"}' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 10,
          totalTokenCount: 25,
        },
      });
    });

    const provider = new GeminiProvider({ apiKey: 'test-key', transport });
    const response = await provider.complete(request);

    expect(response.provider).toBe('gemini');
    expect(response.text).toBe('{"summary": "FastAPI service"}');
    expect(response.usage.totalTokens).toBe(25);
    expect(capturedUrl).toContain('/v1beta/models/gemini-1.5-pro:generateContent');
    expect(capturedBody.system_instruction?.parts[0]?.text).toContain('architecture assistant');
    expect(capturedBody.contents[0]?.parts[0]?.text).toContain('Summarize the backend');
  });

  it('streams responses chunk by chunk over SSE', async () => {
    const sseChunks = [
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] }),
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'world!' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 8 } }),
    ];

    const transport = vi.fn(async () => sseResponse(sseChunks));
    const provider = new GeminiProvider({ apiKey: 'test-key', transport });

    const received: string[] = [];
    for await (const chunk of provider.stream(request)) {
      if (chunk.delta) received.push(chunk.delta);
    }

    expect(received.join('')).toBe('Hello world!');
  });

  it('maps HTTP 429 to RateLimitError with retry-after', async () => {
    const transport = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: { 'retry-after': '5' },
      text: async () => 'Resource exhausted',
      stream: () => new ReadableStream(),
    }));

    const provider = new GeminiProvider({ apiKey: 'test-key', transport });
    await expect(provider.complete(request)).rejects.toThrow(RateLimitError);
  });

  it('maps HTTP 500 to ProviderError', async () => {
    const transport = vi.fn(async () => jsonResponse(500, { error: 'Internal server error' }));
    const provider = new GeminiProvider({ apiKey: 'test-key', transport });
    await expect(provider.complete(request)).rejects.toThrow(ProviderError);
  });

  it('allows proxy baseURL without requiring direct client apiKey', async () => {
    const transport = vi.fn(async (req: { url: string }) => {
      expect(req.url).toContain('/api/ai/gemini/v1beta/models');
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      });
    });

    const provider = new GeminiProvider({ baseURL: '/api/ai/gemini', transport });
    const res = await provider.complete(request);
    expect(res.text).toBe('ok');
  });
});
