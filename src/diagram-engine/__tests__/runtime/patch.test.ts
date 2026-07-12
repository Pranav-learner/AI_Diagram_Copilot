import { describe, it, expect } from 'vitest';
import { equals } from '@/dsl';
import { diffToPatch, applyPatch, invertPatch, composePatches } from '../..';
import { createNode, moveNode } from '../..';
import { makeRuntime, nid } from './helpers';

describe('DocumentPatch', () => {
  it('round-trips: applyPatch and invertPatch reproduce both documents', () => {
    const runtime = makeRuntime();
    const a = runtime.getDocument();
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    const b = runtime.getDocument();

    const patch = diffToPatch(a, b);
    expect(equals(applyPatch(a, patch), b)).toBe(true);
    expect(equals(applyPatch(b, invertPatch(patch)), a)).toBe(true);
  });

  it('composes two sequential patches into one equivalent patch', () => {
    const runtime = makeRuntime();
    const a = runtime.getDocument();
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } }, { id: nid('n1') }));
    const b = runtime.getDocument();
    runtime.execute(moveNode(nid('n1'), { x: 99, y: 5 }));
    const c = runtime.getDocument();

    const composed = composePatches(diffToPatch(a, b), diffToPatch(b, c));
    expect(equals(applyPatch(a, composed), c)).toBe(true);
    // A create-then-move composes to a single "add at final position".
    expect(applyPatch(a, composed).nodes['n1']?.position).toEqual({ x: 99, y: 5 });
  });

  it('composes create-then-delete into a no-op', () => {
    const runtime = makeRuntime();
    const a = runtime.getDocument();
    const created = runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    const deleted = diffToPatch(runtime.getDocument(), a); // reverse: delete n1
    const composed = composePatches(created.patch, deleted);
    expect(Object.keys(composed).length).toBe(0); // net nothing
  });
});
