import { describe, it, expect } from 'vitest';
import { MockPlanProvider } from '../MockPlanProvider';
import { DiagramPlanSchema } from '../model/DiagramPlan';
import { validatePlan } from '../validation/validatePlan';
import { DIAGRAM_TYPES } from '../model/DiagramType';
import type { ResolvedRequest } from '../../core/types';

function request(prompt: string): ResolvedRequest {
  return { model: 'm', messages: [{ role: 'user', content: prompt }] };
}

describe('MockPlanProvider', () => {
  const provider = new MockPlanProvider();

  it('produces a schema-valid, semantically-valid plan for a free-form prompt', async () => {
    const res = await provider.complete(request('Design a Netflix microservice architecture'));
    const parsed = DiagramPlanSchema.safeParse(JSON.parse(res.text));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.diagramType).toBe('architecture');
      expect(validatePlan(parsed.data).ok).toBe(true);
    }
  });

  it('detects diagram type from keywords', async () => {
    const cases: Array<[string, string]> = [
      ['draw a flowchart for login', 'flowchart'],
      ['a mind map about productivity', 'mindmap'],
      ['sequence diagram for checkout', 'sequence'],
      ['ER diagram for a shop', 'erd'],
      ['org chart for my company', 'org-chart'],
      ['network topology for the office', 'network'],
      ['project timeline', 'timeline'],
    ];
    for (const [prompt, type] of cases) {
      const res = await provider.complete(request(prompt));
      expect(JSON.parse(res.text).diagramType).toBe(type);
    }
  });

  it('honours an explicit preferred-type hint', async () => {
    const res = await provider.complete(request('make me something\n\nPreferred diagram type: state.'));
    expect(JSON.parse(res.text).diagramType).toBe('state');
  });

  it('produces valid plans for every supported diagram type', async () => {
    for (const type of DIAGRAM_TYPES) {
      const res = await provider.complete(request(`x\n\nPreferred diagram type: ${type}.`));
      const parsed = DiagramPlanSchema.safeParse(JSON.parse(res.text));
      expect(parsed.success, `schema for ${type}`).toBe(true);
      if (parsed.success) expect(validatePlan(parsed.data).ok, `semantics for ${type}`).toBe(true);
    }
  });

  it('streams JSON chunks that reconstruct the full plan', async () => {
    let text = '';
    for await (const chunk of provider.stream(request('flowchart'))) text += chunk.delta;
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
