import { describe, it, expect } from 'vitest';
import { MockEditProvider } from '../MockEditProvider';
import { EditPlanSchema } from '../model/EditPlan';
import { understandDiagram, renderUnderstanding } from '../DiagramUnderstanding';
import { validateEditPlan } from '../validateEditPlan';
import { sampleDiagram, contextSource } from './helpers';
import type { ResolvedRequest } from '../../core/types';

const { doc } = sampleDiagram();
const contextBlock = renderUnderstanding(understandDiagram(contextSource(doc)));

function request(prompt: string): ResolvedRequest {
  return {
    model: 'm',
    messages: [
      { role: 'developer', content: `Current diagram context:\n${contextBlock}` },
      { role: 'user', content: prompt },
    ],
  };
}

async function planFor(prompt: string) {
  const res = await new MockEditProvider().complete(request(prompt));
  const parsed = EditPlanSchema.safeParse(JSON.parse(res.text));
  expect(parsed.success, `schema for "${prompt}"`).toBe(true);
  if (!parsed.success) throw new Error('unreachable');
  expect(validateEditPlan(parsed.data).ok, `structural for "${prompt}"`).toBe(true);
  return parsed.data;
}

describe('MockEditProvider', () => {
  it('parses "Add Redis between the API and the Database"', async () => {
    const plan = await planFor('Add Redis between the API and the Database');
    expect(plan.edits.map((e) => e.op)).toEqual(['add_node', 'connect', 'connect']);
  });

  it('parses a rename', async () => {
    const plan = await planFor('Rename API to Edge Gateway');
    expect(plan.edits[0]!.op).toBe('rename_node');
  });

  it('parses a delete', async () => {
    const plan = await planFor('Delete the Database');
    expect(plan.edits[0]!.op).toBe('remove_node');
  });

  it('parses "color all services blue" into a style edit', async () => {
    const plan = await planFor('Color all services blue');
    expect(plan.edits[0]!.op).toBe('update_style');
  });

  it('parses a group request', async () => {
    const plan = await planFor('Group Auth Service and Catalog Service as Backend');
    expect(plan.edits[0]!.op).toBe('group');
  });

  it('parses a relative move', async () => {
    const plan = await planFor('Move Auth Service below Database');
    expect(plan.edits[0]!.op).toBe('move_node');
  });

  it('streams JSON that reconstructs the plan', async () => {
    let text = '';
    for await (const chunk of new MockEditProvider().stream(request('Delete the Database'))) text += chunk.delta;
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
