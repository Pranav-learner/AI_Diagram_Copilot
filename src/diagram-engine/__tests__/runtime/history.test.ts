import { describe, it, expect } from 'vitest';
import { equals } from '@/dsl';
import type { HistorySnapshot } from '../..';
import { createNode, moveNode } from '../..';
import { makeRuntime, nid, nodeCount } from './helpers';

function trackHistory(runtime: ReturnType<typeof makeRuntime>) {
  const box = { snapshot: undefined as HistorySnapshot | undefined };
  runtime.events.on('history:changed', (s) => (box.snapshot = s));
  return box;
}

describe('undo / redo', () => {
  it('undo restores the previous document exactly; redo re-applies', () => {
    const runtime = makeRuntime();
    const doc0 = runtime.getDocument();

    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    expect(runtime.canUndo).toBe(true);

    expect(runtime.undo()).toBe(true);
    expect(equals(runtime.getDocument(), doc0)).toBe(true);
    expect(runtime.canRedo).toBe(true);

    expect(runtime.redo()).toBe(true);
    expect(nodeCount(runtime)).toBe(1);
  });

  it('clears the redo stack when a new operation runs', () => {
    const runtime = makeRuntime();
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    runtime.undo();
    expect(runtime.canRedo).toBe(true);
    runtime.execute(createNode({ type: 'shape', shape: 'ellipse' }, { id: nid('n2') }));
    expect(runtime.canRedo).toBe(false);
  });

  it('undoes multiple operations in reverse order', () => {
    const runtime = makeRuntime();
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    runtime.execute(createNode({ type: 'shape', shape: 'ellipse' }, { id: nid('n2') }));
    runtime.undo();
    expect(runtime.getDocument().nodes['n2']).toBeUndefined();
    expect(runtime.getDocument().nodes['n1']).toBeDefined();
    runtime.undo();
    expect(nodeCount(runtime)).toBe(0);
  });

  it('compresses consecutive same-target moves into one history entry', () => {
    const runtime = makeRuntime();
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }, { id: nid('n1') }));
    const history = trackHistory(runtime);

    runtime.execute(moveNode(nid('n1'), { x: 10, y: 0 }));
    runtime.execute(moveNode(nid('n1'), { x: 20, y: 0 }));
    runtime.execute(moveNode(nid('n1'), { x: 30, y: 0 }));

    // The three moves coalesced onto one entry (the create is the other).
    expect(history.snapshot?.undoDepth).toBe(2);
    // One undo reverts the whole drag back to the original position.
    runtime.undo();
    expect(runtime.getDocument().nodes['n1']?.position).toEqual({ x: 0, y: 0 });
  });

  it('emits history:changed with accurate availability', () => {
    const runtime = makeRuntime();
    const history = trackHistory(runtime);
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    expect(history.snapshot?.canUndo).toBe(true);
    expect(history.snapshot?.canRedo).toBe(false);
    runtime.undo();
    expect(history.snapshot?.canUndo).toBe(false);
    expect(history.snapshot?.canRedo).toBe(true);
  });
});
