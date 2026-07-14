/**
 * A heuristic, network-free provider that emits a valid {@link InsightBriefing}.
 *
 * It reads the ranked insights the engine injected into the prompt (each tagged
 * with an `[id]`) and produces proactive "I noticed…" observations that reference
 * exactly those ids — never inventing new ones. Lets the Intelligence Engine's
 * briefing run with **no API key** and makes tests deterministic.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';

const CAPS: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 100_000 };

interface ParsedInsight {
  id: string;
  severity: string;
  title: string;
  summary: string;
}

export class MockInsightProvider implements AIProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  private readonly chunkSize: number;

  constructor(options: { id?: string; chunkSize?: number } = {}) {
    this.id = options.id ?? 'mock-insight';
    this.chunkSize = options.chunkSize ?? 64;
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    if (signal?.aborted) throw new CancelledError();
    const insights = parseInsights(request);
    const text = JSON.stringify(buildBriefing(insights));
    return {
      text,
      finishReason: 'stop',
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: estimateMessagesTokens(request.messages),
        completionTokens: estimateTokens(text),
        totalTokens: estimateMessagesTokens(request.messages) + estimateTokens(text),
      },
    };
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const response = await this.complete(request, signal);
    for (let i = 0; i < response.text.length; i += this.chunkSize) {
      if (signal?.aborted) throw new CancelledError();
      yield { delta: response.text.slice(i, i + this.chunkSize), done: false };
    }
    yield { delta: '', done: true, finishReason: 'stop', usage: response.usage };
  }
}

export function mockInsightProvider(options?: { id?: string; chunkSize?: number }): MockInsightProvider {
  return new MockInsightProvider(options);
}

const INSIGHT_RE = /^- \[([^\]]+)\]\s*\(([^,]+),\s*([^,]+),[^)]*\)\s*([^:]+):\s*(.*?)(?:\s—\s.*)?$/;

function parseInsights(request: ResolvedRequest): ParsedInsight[] {
  const text = request.messages.map((m) => m.content).join('\n');
  const out: ParsedInsight[] = [];
  for (const line of text.split('\n')) {
    const m = INSIGHT_RE.exec(line.trim());
    if (m) out.push({ id: m[1]!, severity: m[3]!.trim(), title: m[4]!.trim(), summary: m[5]!.trim() });
  }
  return out;
}

function buildBriefing(insights: readonly ParsedInsight[]): {
  headline: string;
  observations: { insightId: string; observation: string; recommendation: string }[];
  nextActions: string[];
  confidence: number;
} {
  if (insights.length === 0) {
    return { headline: 'The design looks healthy — no notable issues right now.', observations: [], nextActions: [], confidence: 0.8 };
  }
  const high = insights.filter((i) => i.severity === 'critical' || i.severity === 'high');
  const headline = high.length > 0 ? `I spotted ${high.length} higher-priority item(s) worth your attention.` : `A few smaller improvements are available.`;
  const top = insights.slice(0, 5);
  return {
    headline,
    observations: top.map((i) => ({ insightId: i.id, observation: `I noticed ${lowerFirst(i.title)} — ${i.summary}`, recommendation: `Consider addressing "${i.title}".` })),
    nextActions: (high.length ? high : insights).slice(0, 3).map((i) => `Address: ${i.title}`),
    confidence: 0.8,
  };
}

function lowerFirst(s: string): string {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s;
}
