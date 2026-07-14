import { describe, it, expect } from 'vitest';
import { SemanticQuery, buildSemanticGraph } from '@/ai';
import type { ResolvedRequest } from '@/ai';
import { ExplanationPlanner } from '../ExplanationPlanner';
import { buildExplainContext } from '../ContextView';
import { MockExplainProvider } from '../MockExplainProvider';
import { ExplanationSchema } from '../model/Explanation';
import { architecture } from './helpers';

function request(block: string, depth: 'overview' | 'detailed'): ResolvedRequest {
  return {
    model: 'mock',
    messages: [
      { role: 'system', content: 'You are Explain Mode.' },
      { role: 'developer', content: `Depth: ${depth}. Current diagram context:\n${block}` },
      { role: 'user', content: 'Explain this.' },
    ],
  };
}

describe('MockExplainProvider', () => {
  it('emits a schema-valid explanation grounded in the context', async () => {
    const { doc, ids } = architecture();
    const query = new SemanticQuery(buildSemanticGraph(doc));
    const req = new ExplanationPlanner().plan(query, { target: { kind: 'node', id: ids.gateway } });
    const view = buildExplainContext(query, req);

    const provider = new MockExplainProvider();
    const response = await provider.complete(request(view.block, 'overview'));
    const parsed = ExplanationSchema.safeParse(JSON.parse(response.text));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.summary).toMatch(/API Gateway/);
      expect(parsed.data.sections).toBeUndefined(); // overview → no sections
    }
  });

  it('adds sections for detailed depth', async () => {
    const { doc, ids } = architecture();
    const query = new SemanticQuery(buildSemanticGraph(doc));
    const req = new ExplanationPlanner().plan(query, { target: { kind: 'node', id: ids.db } });
    const view = buildExplainContext(query, req);

    const provider = new MockExplainProvider();
    const response = await provider.complete(request(view.block, 'detailed'));
    const parsed = ExplanationSchema.parse(JSON.parse(response.text));
    expect(parsed.sections?.length).toBeGreaterThan(0);
  });

  it('streams the same content in chunks', async () => {
    const provider = new MockExplainProvider({ chunkSize: 8 });
    let text = '';
    for await (const chunk of provider.stream(request('{}', 'overview'))) text += chunk.delta;
    expect(() => ExplanationSchema.parse(JSON.parse(text))).not.toThrow();
  });
});
