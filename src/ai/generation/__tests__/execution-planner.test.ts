import { describe, it, expect } from 'vitest';
import { ExecutionPlanner } from '../ExecutionPlanner';
import { samplePlan } from './helpers';
import { createDefaultOperationRegistry } from '@/diagram-engine';

const KNOWN = new Set(createDefaultOperationRegistry().types());

describe('ExecutionPlanner', () => {
  it('emits node.create / edge.connect / document.metadata operations', () => {
    const result = new ExecutionPlanner().plan(samplePlan());
    const types = result.operations.operations.map((o) => o.type);
    expect(types.filter((t) => t === 'node.create')).toHaveLength(3);
    expect(types.filter((t) => t === 'edge.connect')).toHaveLength(2);
    expect(types).toContain('document.metadata');
    expect(result.operations.atomic).toBe(true);
  });

  it('only emits operations the runtime registry knows (no LLM-invented ops)', () => {
    const result = new ExecutionPlanner().plan(samplePlan({ groups: [{ id: 'g', label: 'G', nodeIds: ['a', 'b'] }] }));
    for (const op of result.operations.operations) expect(KNOWN.has(op.type)).toBe(true);
  });

  it('assigns concrete positions from the layout engine (LLM sends none)', () => {
    const result = new ExecutionPlanner().plan(samplePlan());
    for (const op of result.operations.operations) {
      if (op.type !== 'node.create') continue;
      const spec = op.params.spec as { position: { x: number; y: number }; size: { width: number; height: number } };
      expect(typeof spec.position.x).toBe('number');
      expect(spec.size.width).toBeGreaterThan(0);
    }
  });

  it('maps plan ids to minted DSL ids consistently across nodes and edges', () => {
    const result = new ExecutionPlanner().plan(samplePlan());
    const createOps = result.operations.operations.filter((o) => o.type === 'node.create');
    const dslIds = new Set(createOps.map((o) => o.params.id as string));
    const edge = result.operations.operations.find((o) => o.type === 'edge.connect')!;
    expect(dslIds.has(edge.params.source as string)).toBe(true);
    expect(dslIds.has(edge.params.target as string)).toBe(true);
    expect(result.nodeIdMap['a']).toBe(createOps[0]!.params.id);
  });

  it('chooses shapes from semantic roles (decision → diamond)', () => {
    const plan = samplePlan({ nodes: [{ id: 'd', label: 'OK?', type: 'decision' }], relationships: [] });
    const op = new ExecutionPlanner().plan(plan).operations.operations.find((o) => o.type === 'node.create')!;
    expect((op.params.spec as { shape: string }).shape).toBe('diamond');
  });

  it('creates group operations after the member nodes exist', () => {
    const plan = samplePlan({ groups: [{ id: 'g', label: 'G', nodeIds: ['a', 'b'] }] });
    const ops = new ExecutionPlanner().plan(plan).operations.operations.map((o) => o.type);
    const groupIdx = ops.indexOf('group.create');
    const firstNodeIdx = ops.indexOf('node.create');
    expect(groupIdx).toBeGreaterThan(-1);
    // The 3 member node.creates precede the group.create.
    expect(groupIdx).toBeGreaterThan(firstNodeIdx + 2);
  });
});
