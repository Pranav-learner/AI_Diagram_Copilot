import { describe, it, expect } from 'vitest';
import { DiagramModel } from '@/dsl';
import { DiagramRuntime } from '@/diagram-engine';
import { createRuntimeGateway } from '@/features/canvas/runtime/runtimeGateway';
import { DiagramGenerator } from '../DiagramGenerator';
import { createGenerationHandler } from '../GenerationHandler';
import { AIPipeline } from '../../pipeline/AIPipeline';
import { RuleBasedIntentAnalyzer } from '../../planning/IntentAnalyzer';
import { generationService } from './helpers';

function freshRuntime(): DiagramRuntime {
  return new DiagramRuntime(DiagramModel.create({ name: 'Blank' }).document);
}

describe('generation → real DiagramRuntime (end-to-end)', () => {
  it('generates a diagram that lands in the runtime as valid DSL', async () => {
    const runtime = freshRuntime();
    const gateway = createRuntimeGateway(runtime);
    const generator = new DiagramGenerator({ service: generationService(), gateway });

    const result = await generator.generate({ prompt: 'Design a microservice architecture', stream: false });

    const doc = runtime.getDocument();
    expect(Object.keys(doc.nodes).length).toBe(result.plan.nodes.length);
    expect(Object.keys(doc.edges).length).toBe(result.plan.relationships.length);
    // The whole generation is a single undoable transaction.
    expect(runtime.canUndo).toBe(true);
    runtime.undo();
    expect(Object.keys(runtime.getDocument().nodes)).toHaveLength(0);
  });

  it('produces a document that passes DSL validation', async () => {
    const runtime = freshRuntime();
    await new DiagramGenerator({ service: generationService(), gateway: createRuntimeGateway(runtime) }).generate({
      prompt: 'flowchart for onboarding',
      stream: false,
    });
    const result = DiagramModel.fromDocument(runtime.getDocument()).validate();
    expect(result.valid).toBe(true);
  });

  it('works through the generic AIPipeline via the GenerationHandler', async () => {
    const runtime = freshRuntime();
    const pipeline = new AIPipeline({
      service: generationService(),
      intentAnalyzer: new RuleBasedIntentAnalyzer(),
      gateway: createRuntimeGateway(runtime),
    });
    pipeline.handlerRegistry.register(createGenerationHandler());

    const outcome = await pipeline.run({ text: 'Create an architecture diagram', hasDiagram: false });
    expect(outcome.handled).toBe(true);
    expect(outcome.classification.intent).toBe('generate');
    expect(Object.keys(runtime.getDocument().nodes).length).toBeGreaterThan(0);
  });
});
