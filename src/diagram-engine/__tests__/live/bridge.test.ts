import { describe, it, expect } from 'vitest';
import { DiagramModel, fixedClock } from '@/dsl';
import type { NodeId } from '@/dsl';
import { createEditorIntegration, createManualScheduler, BridgeEventName } from '../..';
import type { ExcalidrawScene, ExElement } from '../..';
import { makeModel, makeEngine, FIXED_TIME } from '../helpers';
import {
  FakeCanvasPort,
  sceneSignature,
  moveElement,
  resizeElement,
  removeElements,
  addBareRectangle,
  setZoom,
} from './fakePort';

function setup(
  build: (model: DiagramModel) => void,
  opts: { scheduler?: ReturnType<typeof createManualScheduler> } = {},
) {
  const model = makeModel();
  build(model);
  const doc = model.document;
  const engine = makeEngine();
  const scene = engine.render<ExcalidrawScene, ExElement>(doc).scene;
  const port = new FakeCanvasPort(scene);
  const integration = createEditorIntegration<ExcalidrawScene>({
    engine,
    port,
    initialDocument: doc,
    signature: sceneSignature,
    scheduler: opts.scheduler,
  });
  integration.start();
  return { model, doc, engine, scene, port, integration, runtime: integration.runtime };
}

describe('CanvasBridge — canvas → DSL ingest', () => {
  it('drops the initial mount echo (same scene, no commit)', () => {
    const nodeId = { current: '' };
    const { port, runtime } = setup((m) => {
      nodeId.current = m.createNode({ type: 'shape', shape: 'rectangle' }).id;
    });
    port.userSetScene(port.getScene()); // identical scene echo
    expect(runtime.getVersion()).toBe(1); // no commit
  });

  it('captures a drag (move) into the DSL', () => {
    let nodeId = '' as NodeId;
    const { port, scene, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }).id;
    });
    port.userSetScene(moveElement(scene, nodeId, 50, 30));
    expect(runtime.getDocument().nodes[nodeId]?.position).toEqual({ x: 50, y: 30 });
    expect(runtime.getVersion()).toBe(2);
  });

  it('captures a resize into the DSL', () => {
    let nodeId = '' as NodeId;
    const { port, scene, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle', size: { width: 100, height: 60 } }).id;
    });
    port.userSetScene(resizeElement(scene, nodeId, 220, 140));
    expect(runtime.getDocument().nodes[nodeId]?.size).toEqual({ width: 220, height: 140 });
  });

  it('captures a delete into the DSL', () => {
    let nodeId = '' as NodeId;
    const { port, scene, runtime } = setup((m) => {
      m.createNode({ type: 'shape', shape: 'rectangle' });
      nodeId = m.createNode({ type: 'shape', shape: 'ellipse' }).id;
    });
    port.userSetScene(removeElements(scene, [nodeId]));
    expect(runtime.getDocument().nodes[nodeId]).toBeUndefined();
    expect(Object.keys(runtime.getDocument().nodes)).toHaveLength(1);
  });

  it('captures a freshly-drawn (escrow-less) shape as a new DSL node', () => {
    const { port, scene, runtime } = setup((m) => {
      m.createNode({ type: 'shape', shape: 'rectangle' });
    });
    const template = scene.elements[0]!;
    port.userSetScene(addBareRectangle(scene, template, 'drawn-rect'));
    const node = runtime.getDocument().nodes['drawn-rect'];
    expect(node?.type).toBe('shape');
    expect(Object.keys(runtime.getDocument().nodes)).toHaveLength(2);
  });

  it('coalesces rapid edits into a single commit', () => {
    const scheduler = createManualScheduler();
    let nodeId = '' as NodeId;
    const { port, scene, runtime } = setup(
      (m) => {
        nodeId = m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }).id;
      },
      { scheduler },
    );
    // Three drag ticks before the scheduler flushes.
    port.userSetScene(moveElement(scene, nodeId, 10, 0));
    port.userSetScene(moveElement(scene, nodeId, 20, 0));
    port.userSetScene(moveElement(scene, nodeId, 30, 0));
    expect(runtime.getVersion()).toBe(1); // nothing ingested yet
    scheduler.flush();
    expect(runtime.getVersion()).toBe(2); // exactly one commit
    expect(runtime.getDocument().nodes[nodeId]?.position.x).toBe(30); // final state
  });
});

describe('CanvasBridge — DSL → canvas + loop prevention', () => {
  it('applies a program change to the canvas and drops the sync echo', () => {
    let nodeId = '' as NodeId;
    const { port, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }).id;
    });
    const before = runtime.getVersion();

    runtime.mutate((current) => {
      const m = DiagramModel.fromDocument(current, { clock: fixedClock(FIXED_TIME) });
      m.updateNode(nodeId, { position: { x: 200, y: 0 } });
      return m.document;
    });

    expect(runtime.getVersion()).toBe(before + 1); // ONLY the program commit
    expect(port.applyCount).toBe(1); // rendered to canvas once
    // The applied scene reflects the move; the echo produced no extra commit.
    expect(port.getScene().elements.find((e) => e.id === nodeId)?.x).toBe(200);
  });

  it('drops an async echo via the scene signature', async () => {
    let nodeId = '' as NodeId;
    const { port, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle' }).id;
    });
    port.echoMode = 'async';
    const before = runtime.getVersion();

    runtime.mutate((current) => {
      const m = DiagramModel.fromDocument(current, { clock: fixedClock(FIXED_TIME) });
      m.updateNode(nodeId, { position: { x: 77, y: 0 } });
      return m.document;
    });
    await Promise.resolve(); // let the async echo fire

    expect(runtime.getVersion()).toBe(before + 1); // echo dropped, no loop
  });

  it('a user (canvas-origin) edit never re-applies back to the canvas', () => {
    let nodeId = '' as NodeId;
    const { port, scene, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }).id;
    });
    const applyBefore = port.applyCount;
    port.userSetScene(moveElement(scene, nodeId, 5, 5));
    expect(runtime.getVersion()).toBe(2); // ingested
    expect(port.applyCount).toBe(applyBefore); // but no toCanvas → no loop
  });
});

describe('CanvasBridge — selection & viewport', () => {
  it('syncs selection both ways without touching the DSL', () => {
    let nodeId = '' as NodeId;
    const { port, integration, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle' }).id;
    });
    const seen: string[][] = [];
    integration.bridge.events.on(BridgeEventName.SelectionChanged, ({ ids }) => seen.push([...ids]));

    port.userSelect([nodeId]);
    expect(integration.bridge.getSelection()).toEqual([nodeId]);
    expect(seen.at(-1)).toEqual([nodeId]);

    integration.bridge.setSelection([]);
    expect(port.getSelectedIds()).toEqual([]);
    expect(runtime.getVersion()).toBe(1); // selection never commits to the DSL
  });

  it('captures a viewport (zoom) change and preserves it across content updates', () => {
    let nodeId = '' as NodeId;
    const { port, scene, runtime } = setup((m) => {
      nodeId = m.createNode({ type: 'shape', shape: 'rectangle' }).id;
    });
    port.userSetScene(setZoom(scene, 2));
    expect(runtime.getDocument().viewport.zoom).toBe(2);

    // A program content change must not reset the zoom.
    runtime.mutate((current) => {
      const m = DiagramModel.fromDocument(current, { clock: fixedClock(FIXED_TIME) });
      m.updateNode(nodeId, { position: { x: 300, y: 0 } });
      return m.document;
    });
    expect(port.getScene().appState.zoom?.value).toBe(2);
  });
});
