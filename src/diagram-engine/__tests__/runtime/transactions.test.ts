import { describe, it, expect } from 'vitest';
import { equals } from '@/dsl';
import { OperationError } from '../..';
import { createNode, deleteNode } from '../..';
import { makeRuntime, nid, nodeCount } from './helpers';

const rect = (id: string) => createNode({ type: 'shape', shape: 'rectangle' }, { id: nid(id) });

describe('transactions', () => {
  it('commits multiple operations as one atomic, undoable entry', () => {
    const runtime = makeRuntime();
    const startVersion = runtime.getVersion();

    runtime.transaction((tx) => {
      tx.execute(rect('n1'));
      tx.execute(rect('n2'));
    });

    expect(nodeCount(runtime)).toBe(2);
    expect(runtime.getVersion()).toBe(startVersion + 1); // one commit
    runtime.undo();
    expect(nodeCount(runtime)).toBe(0); // both reverted by a single undo
  });

  it('flattens nested transactions into one outer commit', () => {
    const runtime = makeRuntime();
    let commits = 0;
    runtime.events.on('commit', () => (commits += 1));

    runtime.transaction((tx) => {
      tx.execute(rect('n1'));
      runtime.transaction((inner) => inner.execute(rect('n2')));
    });

    expect(nodeCount(runtime)).toBe(2);
    expect(commits).toBe(1); // only the outermost commits
    runtime.undo();
    expect(nodeCount(runtime)).toBe(0);
  });

  it('rolls back the whole transaction if any operation fails', () => {
    const runtime = makeRuntime();
    const doc0 = runtime.getDocument();
    let rolledBack = 0;
    runtime.events.on('transaction:rolled-back', () => (rolledBack += 1));

    expect(() =>
      runtime.transaction((tx) => {
        tx.execute(rect('n1'));
        tx.execute(deleteNode(nid('ghost'))); // fails validation → throws
      }),
    ).toThrow(OperationError);

    // Atomic: n1 was never applied.
    expect(equals(runtime.getDocument(), doc0)).toBe(true);
    expect(runtime.canUndo).toBe(false);
    expect(rolledBack).toBe(1);
  });

  it('executeBatch is atomic', () => {
    const runtime = makeRuntime();
    const doc0 = runtime.getDocument();

    expect(() => runtime.executeBatch([rect('n1'), deleteNode(nid('ghost'))])).toThrow();
    expect(equals(runtime.getDocument(), doc0)).toBe(true); // nothing applied

    const result = runtime.executeBatch([rect('n1'), rect('n2')]);
    expect(nodeCount(runtime)).toBe(2);
    expect(Object.keys(result.patch.nodes?.added ?? {}).sort()).toEqual(['n1', 'n2']);
    runtime.undo();
    expect(nodeCount(runtime)).toBe(0); // batch is one undo entry
  });
});
