import { describe, it, expect } from 'vitest';
import { OperationError } from '../..';
import {
  createNode,
  deleteNode,
  moveNode,
  resizeNode,
  setNodeLocked,
  connectNodes,
  disconnectNodes,
  createGroup,
  addToGroup,
} from '../..';
import { makeRuntime, nid, eid, gid, nodeCount } from './helpers';

function seedNode(runtime: ReturnType<typeof makeRuntime>, id: string, x = 0, y = 0) {
  runtime.execute(createNode({ type: 'shape', shape: 'rectangle', position: { x, y } }, { id: nid(id) }));
}

describe('operation execution', () => {
  it('creates a node and bumps the version', () => {
    const runtime = makeRuntime();
    const before = runtime.getVersion();
    const result = runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    expect(nodeCount(runtime)).toBe(1);
    expect(runtime.getVersion()).toBe(before + 1);
    expect(Object.keys(result.patch.nodes?.added ?? {})).toEqual(['n1']);
  });

  it('moves a node', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'n1', 0, 0);
    runtime.execute(moveNode(nid('n1'), { x: 50, y: 30 }));
    expect(runtime.getDocument().nodes['n1']?.position).toEqual({ x: 50, y: 30 });
  });

  it('resizes a node', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'n1');
    runtime.execute(resizeNode(nid('n1'), { width: 200, height: 120 }));
    expect(runtime.getDocument().nodes['n1']?.size).toEqual({ width: 200, height: 120 });
  });

  it('deletes a node and cascades incident edges', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'a');
    seedNode(runtime, 'b');
    runtime.execute(connectNodes(nid('a'), nid('b'), {}, { id: eid('e1') }));
    expect(Object.keys(runtime.getDocument().edges)).toEqual(['e1']);
    runtime.execute(deleteNode(nid('a')));
    expect(runtime.getDocument().nodes['a']).toBeUndefined();
    expect(runtime.getDocument().edges['e1']).toBeUndefined(); // cascade
  });

  it('connects two nodes with an edge', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'a');
    seedNode(runtime, 'b');
    runtime.execute(connectNodes(nid('a'), nid('b'), { routing: 'orthogonal' }, { id: eid('e1') }));
    const edge = runtime.getDocument().edges['e1'];
    expect(edge?.source.nodeId).toBe('a');
    expect(edge?.target.nodeId).toBe('b');
    runtime.execute(disconnectNodes(eid('e1')));
    expect(runtime.getDocument().edges['e1']).toBeUndefined();
  });
});

describe('operation validation (no mutation on failure)', () => {
  it('rejects connecting a missing node', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'a');
    expect(() => runtime.execute(connectNodes(nid('a'), nid('ghost')))).toThrow(OperationError);
    expect(Object.keys(runtime.getDocument().edges)).toHaveLength(0);
  });

  it('rejects deleting a non-existent node', () => {
    const runtime = makeRuntime();
    expect(() => runtime.execute(deleteNode(nid('ghost')))).toThrow(OperationError);
  });

  it('rejects creating a duplicate id', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'n1');
    expect(() =>
      runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') })),
    ).toThrow(OperationError);
    expect(nodeCount(runtime)).toBe(1);
  });

  it('rejects moving a locked node', () => {
    const runtime = makeRuntime();
    seedNode(runtime, 'n1', 0, 0);
    runtime.execute(setNodeLocked(nid('n1'), true));
    expect(() => runtime.execute(moveNode(nid('n1'), { x: 99, y: 99 }))).toThrow(OperationError);
    expect(runtime.getDocument().nodes['n1']?.position).toEqual({ x: 0, y: 0 });
  });

  it('rejects a circular group hierarchy', () => {
    const runtime = makeRuntime();
    runtime.execute(createGroup({ name: 'outer' }, { id: gid('g1') }));
    runtime.execute(createGroup({ name: 'inner' }, { id: gid('g2') }));
    runtime.execute(addToGroup(gid('g1'), gid('g2')));
    // g2 already contains-chain under g1 → adding g1 into g2 would cycle.
    expect(() => runtime.execute(addToGroup(gid('g2'), gid('g1')))).toThrow(OperationError);
  });

  it('emits operation:failed and does not commit on rejection', () => {
    const runtime = makeRuntime();
    let failed = 0;
    let committed = 0;
    runtime.events.on('operation:failed', () => (failed += 1));
    runtime.events.on('commit', () => (committed += 1));
    expect(() => runtime.execute(deleteNode(nid('ghost')))).toThrow();
    expect(failed).toBe(1);
    expect(committed).toBe(0);
  });
});
