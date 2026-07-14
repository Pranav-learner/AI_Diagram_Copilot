/**
 * A heuristic, network-free provider that emits a valid {@link Explanation}.
 *
 * Like the generation/editing mocks, this is a real {@link AIProvider} (its output
 * still flows through validation → formatting), not a bypass. It reads the injected
 * semantic context block + the requested depth and composes a grounded, if plain,
 * explanation of the focus element(s). It lets Explain Mode run with **no API key**
 * and makes tests deterministic; real prose quality comes from a real provider.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';

const CAPS: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 100_000 };

interface CtxEntity {
  id: string;
  kind: string;
  label: string;
}
interface CtxRel {
  kind: string;
  from: string;
  to: string;
  label?: string;
}
interface Ctx {
  focus: string[];
  entities: CtxEntity[];
  relationships: CtxRel[];
}

export class MockExplainProvider implements AIProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  private readonly chunkSize: number;

  constructor(options: { id?: string; chunkSize?: number } = {}) {
    this.id = options.id ?? 'mock-explain';
    this.chunkSize = options.chunkSize ?? 48;
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    if (signal?.aborted) throw new CancelledError();
    const ctx = parseContext(request);
    const detailed = /depth:\s*detailed/i.test(allText(request));
    const text = JSON.stringify(buildExplanation(ctx, detailed));
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

export function mockExplainProvider(options?: { id?: string; chunkSize?: number }): MockExplainProvider {
  return new MockExplainProvider(options);
}

// ── Context parsing + heuristic composition ──────────────────────────────────

function allText(request: ResolvedRequest): string {
  return request.messages.map((m) => m.content).join('\n');
}

function parseContext(request: ResolvedRequest): Ctx {
  for (const message of request.messages) {
    const match = /```json\s*([\s\S]*?)```/.exec(message.content);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]!.trim()) as Partial<Ctx>;
      if (Array.isArray(parsed.entities)) {
        return {
          focus: Array.isArray(parsed.focus) ? parsed.focus : [],
          entities: parsed.entities,
          relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
        };
      }
    } catch {
      /* ignore */
    }
  }
  return { focus: [], entities: [], relationships: [] };
}

function labelOf(ctx: Ctx, id: string): string {
  return ctx.entities.find((e) => e.id === id)?.label ?? id;
}

function buildExplanation(ctx: Ctx, detailed: boolean): {
  summary: string;
  keyPoints: string[];
  sections?: { heading: string; body: string }[];
  confidence: number;
} {
  const focusId = ctx.focus[0];
  const focus = focusId ? ctx.entities.find((e) => e.id === focusId) : undefined;

  if (!focus) {
    // Whole-diagram / multi-focus fallback.
    const summary = `This diagram has ${ctx.entities.length} elements and ${ctx.relationships.length} relationships connecting them.`;
    const keyPoints = ctx.relationships.slice(0, 4).map((r) => `${labelOf(ctx, r.from)} ${humanRel(r.kind)} ${labelOf(ctx, r.to)}`);
    return withSections(summary, keyPoints, detailed, 'Overview', summary);
  }

  const outgoing = ctx.relationships.filter((r) => r.from === focus.id);
  const incoming = ctx.relationships.filter((r) => r.to === focus.id);

  const clauses: string[] = [];
  if (outgoing.length) clauses.push(`it ${humanRel(outgoing[0]!.kind)} ${outgoing.map((r) => labelOf(ctx, r.to)).slice(0, 3).join(', ')}`);
  if (incoming.length) clauses.push(`it is used by ${incoming.map((r) => labelOf(ctx, r.from)).slice(0, 3).join(', ')}`);
  const relationClause = clauses.length ? `; ${clauses.join('; ')}` : '';

  const summary = `"${focus.label}" is a ${focus.kind} in this diagram${relationClause}.`;
  const keyPoints = [
    `Acts as a ${focus.kind} within the surrounding design.`,
    ...outgoing.slice(0, 3).map((r) => `${humanRel(r.kind)} ${labelOf(ctx, r.to)}`),
    ...incoming.slice(0, 2).map((r) => `Serves ${labelOf(ctx, r.from)}`),
  ].slice(0, 6);

  const body = `**${focus.label}** is a ${focus.kind}. ${relationClause ? `In context${relationClause}.` : 'It currently has no connections in the provided context.'}`;
  return withSections(summary, keyPoints, detailed, 'Responsibilities', body);
}

function withSections(
  summary: string,
  keyPoints: string[],
  detailed: boolean,
  heading: string,
  body: string,
): { summary: string; keyPoints: string[]; sections?: { heading: string; body: string }[]; confidence: number } {
  const base = { summary, keyPoints, confidence: 0.85 };
  if (!detailed) return base;
  return { ...base, sections: [{ heading, body }] };
}

/** Turn a canonical relationship kind into a readable verb phrase. */
function humanRel(kind: string): string {
  const map: Record<string, string> = {
    dependsOn: 'depends on',
    calls: 'calls',
    connectsTo: 'connects to',
    contains: 'contains',
    owns: 'owns',
    produces: 'produces to',
    consumes: 'consumes from',
    references: 'references',
    triggers: 'triggers',
    uses: 'uses',
    flowsTo: 'flows to',
    sends: 'sends to',
    transitionsTo: 'transitions to',
  };
  return map[kind] ?? 'connects to';
}
