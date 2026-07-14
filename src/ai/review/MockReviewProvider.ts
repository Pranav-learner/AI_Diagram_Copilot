/**
 * A heuristic, network-free provider that emits a valid {@link ReviewExplanation}.
 *
 * It reads the findings the application injected into the prompt (each tagged with
 * an `[id]`) and produces grounded explanation notes, a summary, and priority
 * actions that reference exactly those ids — never inventing new issues. This lets
 * Diagram Review run with **no API key** and makes tests deterministic; real prose
 * quality comes from swapping in a real provider.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';

const CAPS: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 100_000 };

interface ParsedFinding {
  id: string;
  severity: string;
  title: string;
  message: string;
}

export class MockReviewProvider implements AIProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  private readonly chunkSize: number;

  constructor(options: { id?: string; chunkSize?: number } = {}) {
    this.id = options.id ?? 'mock-review';
    this.chunkSize = options.chunkSize ?? 64;
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    if (signal?.aborted) throw new CancelledError();
    const findings = parseFindings(request);
    const text = JSON.stringify(buildExplanation(findings));
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

export function mockReviewProvider(options?: { id?: string; chunkSize?: number }): MockReviewProvider {
  return new MockReviewProvider(options);
}

// ── Parsing the injected findings ────────────────────────────────────────────

const FINDING_RE = /^- \[([^\]]+)\]\s*\(([^)/]+)[^)]*\)\s*([^:]+):\s*(.*)$/;

function parseFindings(request: ResolvedRequest): ParsedFinding[] {
  const text = request.messages.map((m) => m.content).join('\n');
  const findings: ParsedFinding[] = [];
  for (const line of text.split('\n')) {
    const m = FINDING_RE.exec(line.trim());
    if (m) findings.push({ id: m[1]!, severity: m[2]!.trim(), title: m[3]!.trim(), message: m[4]!.trim() });
  }
  return findings;
}

function buildExplanation(findings: readonly ParsedFinding[]): {
  summary: string;
  strengths: string[];
  priorityActions: string[];
  findingNotes: { findingId: string; note: string }[];
  confidence: number;
} {
  if (findings.length === 0) {
    return { summary: 'No significant issues were found; the diagram is structurally sound.', strengths: ['Clean, well-formed structure'], priorityActions: [], findingNotes: [], confidence: 0.8 };
  }
  const high = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const summary = `The review surfaced ${findings.length} issue(s)${high.length ? `, including ${high.length} of high severity` : ''}. Address the highest-severity items first.`;
  return {
    summary,
    strengths: [],
    priorityActions: (high.length ? high : findings).slice(0, 3).map((f) => `Resolve: ${f.title}`),
    findingNotes: findings.slice(0, 12).map((f) => ({ findingId: f.id, note: `${f.title} — ${f.message} This is worth addressing to improve the design.` })),
    confidence: 0.8,
  };
}
