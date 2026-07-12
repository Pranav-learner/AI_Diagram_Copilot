/**
 * Shared test helpers for the AI foundation suite.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { CancelledError } from '../core/AIError';
import type { HttpResponse } from '../providers/http';
import type { DiagramContextSource } from '../planning/ContextBuilder';
import { DiagramModel } from '@/dsl';
import type { DiagramDocument } from '@/dsl';

const CAPS: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 1000 };

/** A provider whose `complete` never resolves until the signal aborts. */
export function hangingProvider(id = 'hang'): AIProvider {
  return {
    id,
    capabilities: CAPS,
    complete: (_req: ResolvedRequest, signal?: AbortSignal) =>
      new Promise<ChatResponse>((_, reject) => {
        if (signal?.aborted) return reject(new CancelledError());
        signal?.addEventListener('abort', () => reject(new CancelledError()));
      }),
    // eslint-disable-next-line require-yield -- hangs until aborted; never yields
    async *stream(_req: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
      await new Promise<void>((_, reject) => {
        signal?.addEventListener('abort', () => reject(new CancelledError()));
      });
    },
  };
}

/** An immediate no-op sleeper for deterministic retry tests. */
export const immediateSleep = (_ms: number, signal?: AbortSignal): Promise<void> =>
  signal?.aborted ? Promise.reject(new CancelledError()) : Promise.resolve();

/** Build a fake JSON {@link HttpResponse}. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: async () => text,
    async *stream() {
      yield text;
    },
  };
}

/** Build a fake SSE {@link HttpResponse} from raw `data:` payloads. */
export function sseResponse(dataEvents: readonly string[]): HttpResponse {
  const body = dataEvents.map((e) => `data: ${e}\n\n`).join('');
  return {
    status: 200,
    ok: true,
    headers: {},
    text: async () => body,
    async *stream() {
      yield body;
    },
  };
}

/** A minimal {@link DiagramContextSource} over a document. */
export function contextSource(doc: DiagramDocument, selection: string[] = []): DiagramContextSource {
  return {
    getDocument: () => doc,
    getSelection: () => selection,
  };
}

/** Build a small sample diagram: two connected shape nodes. */
export function sampleDocument(): DiagramDocument {
  const model = DiagramModel.create({ name: 'Sample' });
  const a = model.createNode({ type: 'shape', shape: 'rectangle', semantic: 'service', label: { text: 'API' }, position: { x: 0, y: 0 } });
  const b = model.createNode({ type: 'shape', shape: 'cylinder', semantic: 'database', label: { text: 'DB' }, position: { x: 200, y: 0 } });
  model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, label: { text: 'reads' } });
  return model.document;
}
