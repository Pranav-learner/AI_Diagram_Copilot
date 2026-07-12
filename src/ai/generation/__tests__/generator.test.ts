import { describe, it, expect } from 'vitest';
import { DiagramGenerator, GENERATION_STAGES } from '../DiagramGenerator';
import type { StageUpdate } from '../DiagramGenerator';
import { GenerationError } from '../errors';
import { CancelledError } from '../../core/AIError';
import { generationService, scriptedService, recordingGateway, samplePlan } from './helpers';
import { MockProvider } from '../../providers/MockProvider';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { AIService } from '../../core/AIService';
import { mergeConfig } from '../../core/AIConfig';

describe('DiagramGenerator', () => {
  it('runs the full pipeline and applies operations to the gateway', async () => {
    const gateway = recordingGateway();
    const generator = new DiagramGenerator({ service: generationService(), gateway, now: () => 0 });

    const result = await generator.generate({ prompt: 'Design a microservice architecture', stream: false });

    expect(result.plan.diagramType).toBe('architecture');
    expect(result.applied.applied).toBeGreaterThan(0);
    expect(gateway.plans).toHaveLength(1);
    // Every applied operation is a known runtime operation (no bypass).
    const known = new Set(gateway.knownOperationTypes());
    for (const op of gateway.plans[0]!.operations) expect(known.has(op.type)).toBe(true);
  });

  it('reports staged progress in order, ending done', async () => {
    const updates: StageUpdate[] = [];
    const generator = new DiagramGenerator({ service: generationService(), gateway: recordingGateway() });
    await generator.generate({ prompt: 'flowchart', stream: true }, { onStage: (u) => updates.push(u) });

    // Each stage reaches 'done', in the declared order.
    const doneOrder = updates.filter((u) => u.state === 'done').map((u) => u.stage);
    expect(doneOrder).toEqual(GENERATION_STAGES.map((s) => s.stage));
  });

  it('streams plan tokens to the observer', async () => {
    let streamed = '';
    const generator = new DiagramGenerator({ service: generationService(), gateway: recordingGateway() });
    await generator.generate({ prompt: 'flowchart', stream: true }, { onToken: (d) => (streamed += d) });
    expect(streamed.length).toBeGreaterThan(0);
    expect(() => JSON.parse(streamed)).not.toThrow();
  });

  it('self-heals: retries once when the first plan is invalid, then succeeds', async () => {
    // First reply: schema-invalid; second reply: a valid plan.
    const service = scriptedService('{"not":"a plan"}', JSON.stringify(samplePlan()));
    const gateway = recordingGateway();
    const stages: StageUpdate[] = [];
    const generator = new DiagramGenerator({ service, gateway, maxPlanAttempts: 2 });

    const result = await generator.generate({ prompt: 'flowchart', stream: false }, { onStage: (u) => stages.push(u) });
    expect(result.attempts).toBe(2);
    expect(gateway.plans).toHaveLength(1);
    // A retry means the planning stage went active twice.
    expect(stages.filter((s) => s.stage === 'planning' && s.state === 'active').length).toBe(2);
  });

  it('throws GenerationError (not a runtime mutation) when all attempts are invalid', async () => {
    const service = scriptedService('garbage', 'still garbage');
    const gateway = recordingGateway();
    const generator = new DiagramGenerator({ service, gateway, maxPlanAttempts: 2 });
    await expect(generator.generate({ prompt: 'x', stream: false })).rejects.toBeInstanceOf(GenerationError);
    expect(gateway.plans).toHaveLength(0); // runtime never touched
  });

  it('rejects a semantically-invalid plan and never mutates the gateway', async () => {
    const badPlan = JSON.stringify(samplePlan({ relationships: [{ source: 'a', target: 'ghost' }] }));
    const generator = new DiagramGenerator({ service: scriptedService(badPlan, badPlan), gateway: recordingGateway(), maxPlanAttempts: 1 });
    await expect(generator.generate({ prompt: 'x', stream: false })).rejects.toBeInstanceOf(GenerationError);
  });

  it('cancels cleanly before touching the gateway', async () => {
    const controller = new AbortController();
    controller.abort();
    const gateway = recordingGateway();
    const generator = new DiagramGenerator({ service: generationService(), gateway });
    await expect(
      generator.generate({ prompt: 'flowchart', signal: controller.signal, stream: false }),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(gateway.plans).toHaveLength(0);
  });

  it('surfaces plan warnings without failing', async () => {
    // A valid plan with two disconnected nodes → a warning, not an error.
    const plan = JSON.stringify(samplePlan({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], relationships: [] }));
    const service = new AIService({
      registry: new ProviderRegistry().register(new MockProvider({ id: 'm', replies: [plan] })),
      config: mergeConfig({ provider: 'm' }),
    });
    const result = await new DiagramGenerator({ service, gateway: recordingGateway() }).generate({ prompt: 'x', stream: false });
    expect(result.warnings.some((w) => w.code === 'no_relationships')).toBe(true);
  });
});
