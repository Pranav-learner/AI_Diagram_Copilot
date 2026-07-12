import { describe, it, expect } from 'vitest';
import type { NodeId } from '@/dsl';
import { createEditorIntegration, createManualScheduler } from '../..';
import type { ExcalidrawScene, ExElement } from '../..';
import { makeModel, makeEngine } from '../helpers';
import { FakeCanvasPort, sceneSignature, moveElement } from './fakePort';

/**
 * Regression: the coalescing flush must reconcile the *live* canvas, not the
 * (possibly stale) scene snapshot that scheduled it. Exposed by AI generation —
 * a program render right after a queued canvas onChange — where a stale snapshot
 * would overwrite the freshly-rendered DSL. Here a stale drag snapshot must not
 * clobber a later program move.
 */
describe('CanvasBridge — stale pending scene does not overwrite a program render', () => {
  it('flush reconciles the live canvas, not a stale queued snapshot', () => {
    const scheduler = createManualScheduler();
    const model = makeModel();
    let nodeId = '' as NodeId;
    nodeId = model.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }).id;
    const doc = model.document;
    const engine = makeEngine();
    const scene = engine.render<ExcalidrawScene, ExElement>(doc).scene;
    const port = new FakeCanvasPort(scene);
    const integration = createEditorIntegration<ExcalidrawScene>({
      engine,
      port,
      initialDocument: doc,
      signature: sceneSignature,
      scheduler,
    });
    integration.start();
    const runtime = integration.runtime;

    // 1. A queued canvas edit (drag to x=40) schedules a flush but is not run yet.
    port.userSetScene(moveElement(scene, nodeId, 40, 0));
    expect(scheduler.pending).toBe(true);

    // 2. A program op (as AI generation / undo would do) moves the node to x=100
    //    and renders it to the canvas; its own echo is dropped by the lock.
    runtime.executeType('node.move', { id: nodeId, position: { x: 100, y: 0 } });
    expect(runtime.getDocument().nodes[nodeId]?.position.x).toBe(100);

    // 3. Flushing the STALE drag snapshot must NOT roll the node back to x=40.
    //    The bridge reconciles what is actually on the canvas (x=100).
    scheduler.flush();
    expect(runtime.getDocument().nodes[nodeId]?.position.x).toBe(100);
  });
});
