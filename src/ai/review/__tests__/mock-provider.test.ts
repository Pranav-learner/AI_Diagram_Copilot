import { describe, it, expect } from 'vitest';
import type { ResolvedRequest } from '@/ai';
import { MockReviewProvider } from '../MockReviewProvider';
import { ReviewExplanationSchema } from '../model/Review';

function requestWith(findingsBlock: string): ResolvedRequest {
  return {
    model: 'mock',
    messages: [
      { role: 'system', content: 'You are Diagram Review.' },
      { role: 'developer', content: `Findings discovered by static analysis:\n${findingsBlock}` },
      { role: 'user', content: 'Review this diagram.' },
    ],
  };
}

describe('MockReviewProvider', () => {
  it('emits a schema-valid explanation that references only the given finding ids', async () => {
    const block = [
      '- [software/single-point-of-failure#db] (high/availability) Single point of failure: Postgres: shared DB.',
      '- [software/missing-cache#db] (medium/performance) No cache: Postgres is read a lot.',
    ].join('\n');
    const response = await new MockReviewProvider().complete(requestWith(block));
    const parsed = ReviewExplanationSchema.parse(JSON.parse(response.text));

    const noteIds = (parsed.findingNotes ?? []).map((n) => n.findingId);
    expect(noteIds).toContain('software/single-point-of-failure#db');
    expect(noteIds).toContain('software/missing-cache#db');
    expect(parsed.summary).toMatch(/2 issue/);
    expect(parsed.priorityActions?.length).toBeGreaterThan(0);
  });

  it('handles the no-findings case', async () => {
    const response = await new MockReviewProvider().complete(requestWith('No issues were detected by static analysis.'));
    const parsed = ReviewExplanationSchema.parse(JSON.parse(response.text));
    expect(parsed.findingNotes ?? []).toHaveLength(0);
    expect(parsed.strengths?.length).toBeGreaterThan(0);
  });
});
