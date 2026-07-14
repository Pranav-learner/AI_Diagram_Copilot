import { describe, it, expect } from 'vitest';
import { SemanticQuery, buildSemanticGraph } from '@/ai';
import { ExplanationPlanner } from '../ExplanationPlanner';
import { formatExplanation } from '../format';
import { architecture } from './helpers';

describe('formatExplanation', () => {
  it('assembles a markdown document from summary, key points, and sections', () => {
    const { doc, ids } = architecture();
    const query = new SemanticQuery(buildSemanticGraph(doc));
    const request = new ExplanationPlanner().plan(query, { target: { kind: 'node', id: ids.db }, depth: 'detailed' });

    const formatted = formatExplanation({
      request,
      explanation: {
        summary: 'Postgres is the primary datastore.',
        keyPoints: ['Stores orders', 'Read by services'],
        sections: [{ heading: 'Responsibilities', body: 'Holds **persistent** state.' }],
        confidence: 0.9,
      },
      relatedElements: [{ id: ids.svcA, label: 'Orders Service', kind: 'service', relation: 'depends on this', question: 'Explain "Orders Service".' }],
      suggestedQuestions: ['Why is this needed here?'],
    });

    expect(formatted.summary).toBe('Postgres is the primary datastore.');
    expect(formatted.markdown).toContain('Postgres is the primary datastore.');
    expect(formatted.markdown).toContain('**Key points**');
    expect(formatted.markdown).toContain('- Stores orders');
    expect(formatted.markdown).toContain('## Responsibilities');
    expect(formatted.markdown).toContain('Holds **persistent** state.');
    expect(formatted.relatedElements).toHaveLength(1);
    expect(formatted.suggestedQuestions).toEqual(['Why is this needed here?']);
    expect(formatted.targetLabel).toBe('Postgres');
    expect(formatted.domain).toBe('software-architecture');
  });

  it('omits the key-points block when there are none', () => {
    const { doc, ids } = architecture();
    const query = new SemanticQuery(buildSemanticGraph(doc));
    const request = new ExplanationPlanner().plan(query, { target: { kind: 'node', id: ids.db } });
    const formatted = formatExplanation({ request, explanation: { summary: 'A database.' }, relatedElements: [], suggestedQuestions: [] });
    expect(formatted.markdown).toBe('A database.');
    expect(formatted.keyPoints).toEqual([]);
  });
});
