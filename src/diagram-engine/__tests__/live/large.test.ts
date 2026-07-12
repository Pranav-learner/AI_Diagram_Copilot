import { describe, it, expect } from 'vitest';
import {
  buildNode,
  createEmptyDocument,
  createSequentialIdFactory,
  fixedClock,
  CURRENT_SCHEMA_VERSION,
  DiagramModel,
} from '@/dsl';
import type { BuildContext, DiagramDocument, DiagramNode, NodeId } from '@/dsl';
import { createEditorIntegration } from '../..';
import type { ExcalidrawScene, ExElement } from '../..';
import { makeEngine, FIXED_TIME } from '../helpers';
import { FakeCanvasPort, sceneSignature, moveElement } from './fakePort';

function buildLargeDocument(n: number): { doc: DiagramDocument; ids: NodeId[] } {
  const factory = createSequentialIdFactory();
  const clock = fixedClock(FIXED_TIME);
  const ctx: BuildContext = { ids: factory, clock };
  const nodes: Record<string, DiagramNode> = {};
  const ids: NodeId[] = [];
  for (let i = 0; i < n; i++) {
    const node = buildNode(ctx, { type: 'shape', shape: 'rectangle', position: { x: i * 10, y: 0 } });
    nodes[node.id] = node;
    ids.push(node.id);
  }
  const empty = createEmptyDocument({ id: factory.document(), schemaVersion: CURRENT_SCHEMA_VERSION, clock });
  return { doc: { ...empty, nodes }, ids };
}

describe('CanvasBridge — large diagram', () => {
  it('ingests a single move on a 2000-node diagram', () => {
    const { doc, ids } = buildLargeDocument(2000);
    const engine = makeEngine();
    const scene = engine.render<ExcalidrawScene, ExElement>(doc).scene;
    const port = new FakeCanvasPort(scene);
    const integration = createEditorIntegration<ExcalidrawScene>({
      engine,
      port,
      initialDocument: doc,
      signature: sceneSignature,
    });
    integration.start();

    const target = ids[0]!;
    port.userSetScene(moveElement(scene, target, 0, 500));

    expect(integration.runtime.getDocument().nodes[target]?.position).toEqual({ x: 0, y: 500 });
    expect(integration.runtime.getVersion()).toBe(2);
  });

  it('applies a single program change minimally on a large diagram', () => {
    const { doc, ids } = buildLargeDocument(2000);
    const engine = makeEngine();
    const scene = engine.render<ExcalidrawScene, ExElement>(doc).scene;
    const port = new FakeCanvasPort(scene);
    const integration = createEditorIntegration<ExcalidrawScene>({
      engine,
      port,
      initialDocument: doc,
      signature: sceneSignature,
    });
    integration.start();

    const target = ids[1]!;
    integration.runtime.mutate((current) => {
      const model = DiagramModel.fromDocument(current, { clock: fixedClock(FIXED_TIME) });
      model.updateNode(target, { position: { x: 0, y: 999 } });
      return model.document;
    });

    expect(port.applyCount).toBe(1);
    expect(port.getScene().elements.find((e) => e.id === target)?.y).toBe(999);
  });
});
