import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AIPipeline } from '../pipeline/AIPipeline';
import type { IntentHandler } from '../pipeline/IntentHandler';
import { AIService } from '../core/AIService';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { MockProvider } from '../providers/MockProvider';
import { mergeConfig } from '../core/AIConfig';
import { RuleBasedIntentAnalyzer } from '../planning/IntentAnalyzer';
import { planEnvelope } from '../validation/schemas/common';
import type { DiagramGateway } from '../planning/OperationPlanner';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import { contextSource, sampleDocument } from './helpers';

// A test "generate" capability: schema + prompt + operation compilation.
const dataSchema = z.object({ labels: z.array(z.string()) });
const schema = planEnvelope('generate.test', dataSchema);
type Plan = z.infer<typeof schema>;

const handler: IntentHandler<Plan> = {
  intent: 'generate',
  promptTemplate: { id: 'test', version: 'v1', system: 'emit json' },
  schema,
  toOperations(plan): OperationPlan {
    return {
      operations: plan.data.labels.map((text, i) => ({ type: 'node.create', params: { id: `n${i}`, spec: { type: 'shape', label: { text } } } })),
      atomic: true,
    };
  },
};

function gateway(): DiagramGateway & { applied: OperationPlan[] } {
  const applied: OperationPlan[] = [];
  return {
    applied,
    knownOperationTypes: () => ['node.create'],
    apply(plan) {
      applied.push(plan);
      return { applied: plan.operations.length, version: 1 };
    },
  };
}

function serviceReturning(json: string) {
  const registry = new ProviderRegistry().register(new MockProvider({ responder: () => json }));
  return new AIService({ registry, config: mergeConfig({ provider: 'mock' }) });
}

describe('AIPipeline (end-to-end composition)', () => {
  it('runs analyze → prompt → complete → validate → plan → apply', async () => {
    const service = serviceReturning(JSON.stringify({ kind: 'generate.test', confidence: 0.9, data: { labels: ['A', 'B'] } }));
    const gw = gateway();
    const pipeline = new AIPipeline({
      service,
      intentAnalyzer: new RuleBasedIntentAnalyzer(),
      contextSource: contextSource(sampleDocument()),
      gateway: gw,
    });
    pipeline.handlerRegistry.register(handler);

    const result = await pipeline.run({ text: 'create two nodes', hasDiagram: true });
    expect(result.classification.intent).toBe('generate');
    expect(result.handled).toBe(true);
    expect(result.operations!.operations).toHaveLength(2);
    expect(result.applied!.applied).toBe(2);
    expect(gw.applied).toHaveLength(1);
  });

  it('returns handled:false when no handler is registered for the intent', async () => {
    const pipeline = new AIPipeline({
      service: serviceReturning('{}'),
      intentAnalyzer: new RuleBasedIntentAnalyzer(),
    });
    const result = await pipeline.run({ text: 'export to png', hasDiagram: true });
    expect(result.handled).toBe(false);
    expect(result.operations).toBeUndefined();
  });

  it('does not apply when apply:false, but still returns compiled operations', async () => {
    const service = serviceReturning(JSON.stringify({ kind: 'generate.test', confidence: 1, data: { labels: ['X'] } }));
    const gw = gateway();
    const pipeline = new AIPipeline({ service, intentAnalyzer: new RuleBasedIntentAnalyzer(), gateway: gw });
    pipeline.handlerRegistry.register(handler);
    const result = await pipeline.run({ text: 'create a node', hasDiagram: false }, { apply: false });
    expect(result.operations!.operations).toHaveLength(1);
    expect(result.applied).toBeUndefined();
    expect(gw.applied).toHaveLength(0);
  });
});
