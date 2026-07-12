import { describe, it, expect } from 'vitest';
import {
  OperationPlanner,
  PlanCompilerRegistry,
  counterIdMinter,
} from '../planning/OperationPlanner';
import type { DiagramGateway, PlanStep } from '../planning/OperationPlanner';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import { PlanningError } from '../core/AIError';

// A fake gateway capturing applied plans; knows two operation types.
function fakeGateway(): DiagramGateway & { applied: OperationPlan[] } {
  const applied: OperationPlan[] = [];
  return {
    applied,
    knownOperationTypes: () => ['node.create', 'edge.connect'],
    apply(plan) {
      applied.push(plan);
      return { applied: plan.operations.length, version: applied.length };
    },
  };
}

// A compiler that turns an "addPair" step into create+create+connect using refs.
const compilers = new PlanCompilerRegistry().register<PlanStep<'addPair', { a: string; b: string }>>(
  'addPair',
  (step, ctx) => {
    const a = ctx.ref('a');
    const b = ctx.ref('b');
    return [
      { type: 'node.create', params: { id: a, spec: { type: 'shape', label: { text: step.data.a } } } },
      { type: 'node.create', params: { id: b, spec: { type: 'shape', label: { text: step.data.b } } } },
      { type: 'edge.connect', params: { source: a, target: b } },
    ];
  },
);

describe('OperationPlanner', () => {
  it('compiles high-level steps into operation descriptors with coherent refs', () => {
    const planner = new OperationPlanner({ compilers, ids: counterIdMinter('t') });
    const { plan } = planner.compile([{ kind: 'addPair', data: { a: 'API', b: 'DB' } }]);
    expect(plan.operations.map((o) => o.type)).toEqual(['node.create', 'node.create', 'edge.connect']);
    const connect = plan.operations[2]!;
    // The edge references the exact ids minted for the created nodes.
    expect(connect.params.source).toBe(plan.operations[0]!.params.id);
    expect(connect.params.target).toBe(plan.operations[1]!.params.id);
    expect(plan.atomic).toBe(true);
  });

  it('throws PlanningError for an unregistered step kind', () => {
    const planner = new OperationPlanner({ compilers });
    expect(() => planner.compile([{ kind: 'mystery', data: {} }])).toThrow(PlanningError);
  });

  it('validates operation types against the runtime and rejects unknown ops', () => {
    const planner = new OperationPlanner();
    const plan: OperationPlan = { operations: [{ type: 'node.teleport', params: {} }], atomic: true };
    const issues = planner.validate(plan, ['node.create']);
    expect(issues[0]!.code).toBe('unknown_operation');
  });

  it('executes a valid plan through the gateway', () => {
    const planner = new OperationPlanner({ compilers });
    const gateway = fakeGateway();
    const { plan } = planner.compile([{ kind: 'addPair', data: { a: 'A', b: 'B' } }]);
    const result = planner.execute(plan, gateway);
    expect(result.applied).toBe(3);
    expect(gateway.applied).toHaveLength(1);
  });

  it('refuses to execute a plan with unknown operations', () => {
    const planner = new OperationPlanner();
    const gateway = fakeGateway();
    const plan: OperationPlan = { operations: [{ type: 'not.real', params: {} }], atomic: true };
    expect(() => planner.execute(plan, gateway)).toThrow(PlanningError);
    expect(gateway.applied).toHaveLength(0);
  });
});
