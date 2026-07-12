import { describe, it, expect } from 'vitest';
import { DiagramModel } from '@/dsl';
import { DiagramRuntime } from '@/diagram-engine';
import { createRuntimeGateway } from '@/features/canvas/runtime/runtimeGateway';
import { DiagramEditor } from '../DiagramEditor';
import { createEditHandler } from '../EditHandler';
import { AIPipeline } from '../../pipeline/AIPipeline';
import { RuleBasedIntentAnalyzer } from '../../planning/IntentAnalyzer';
import { sampleDiagram, editingService, scriptedService } from './helpers';
import type { DiagramContextSource } from '../../planning/ContextBuilder';

function runtimeSetup() {
  const { doc, ids } = sampleDiagram();
  const runtime = new DiagramRuntime(doc);
  const gateway = createRuntimeGateway(runtime);
  const source: DiagramContextSource = { getDocument: () => runtime.getDocument(), getSelection: () => [] };
  return { runtime, gateway, source, ids };
}

describe('editing → real DiagramRuntime (end-to-end)', () => {
  it('applies an approved edit to the runtime and is undoable', async () => {
    const { runtime, gateway, source } = runtimeSetup();
    const editor = new DiagramEditor({ service: editingService(), gateway, contextSource: source });

    const before = Object.keys(runtime.getDocument().nodes).length;
    const proposal = await editor.propose({ prompt: 'Add Redis between the API and the Database', stream: false });
    expect(proposal.status).toBe('preview');

    editor.apply(proposal);
    const doc = runtime.getDocument();
    expect(Object.keys(doc.nodes).length).toBe(before + 1); // Redis added
    expect(Object.keys(doc.edges).length).toBe(3); // original + 2 new
    expect(DiagramModel.fromDocument(doc).validate().valid).toBe(true);

    // One atomic, undoable transaction.
    expect(runtime.canUndo).toBe(true);
    runtime.undo();
    expect(Object.keys(runtime.getDocument().nodes).length).toBe(before);
  });

  it('renames a node through the real runtime', async () => {
    const { runtime, gateway, source, ids } = runtimeSetup();
    const plan = JSON.stringify({ edits: [{ op: 'rename_node', target: { by: 'id', id: ids.api }, label: 'Edge Gateway' }], confidence: 0.95 });
    const editor = new DiagramEditor({ service: scriptedService(plan), gateway, contextSource: source });

    const proposal = await editor.propose({ prompt: 'rename API to Edge Gateway', stream: false });
    editor.apply(proposal);
    const node = runtime.getDocument().nodes[ids.api!];
    expect(node?.type === 'shape' ? node.label?.text : undefined).toBe('Edge Gateway');
  });

  it('works through the AIPipeline via the EditHandler (auto-apply, unambiguous)', async () => {
    const { runtime, gateway, source, ids } = runtimeSetup();
    const plan = JSON.stringify({ edits: [{ op: 'update_style', targets: [{ by: 'id', id: ids.db }], style: { fill: 'green' } }], confidence: 0.9 });
    const pipeline = new AIPipeline({
      service: scriptedService(plan),
      intentAnalyzer: new RuleBasedIntentAnalyzer(),
      contextSource: source,
      gateway,
    });
    pipeline.handlerRegistry.register(createEditHandler({ contextSource: source }));

    const outcome = await pipeline.run({ text: 'color the database green', hasDiagram: true });
    expect(outcome.handled).toBe(true);
    expect(outcome.classification.intent).toBe('edit');
    expect(runtime.getDocument().nodes[ids.db!]?.style?.fill?.color).toBeDefined();
  });
});
