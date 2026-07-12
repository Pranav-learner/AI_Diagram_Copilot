import { describe, it, expect } from 'vitest';
import {
  buildNode,
  createEmptyDocument,
  createSequentialIdFactory,
  fixedClock,
  CURRENT_SCHEMA_VERSION,
  equals,
} from '@/dsl';
import type { BuildContext, DiagramDocument, DiagramNode, NodeId } from '@/dsl';
import { DiagramRuntime } from '../..';
import { moveNode } from '../..';
import { T } from './helpers';

function buildLargeRuntime(n: number): { runtime: DiagramRuntime; firstId: NodeId } {
  const ids = createSequentialIdFactory();
  const clock = fixedClock(T);
  const ctx: BuildContext = { ids, clock };
  const nodes: Record<string, DiagramNode> = {};
  const nodeIds: NodeId[] = [];
  for (let i = 0; i < n; i++) {
    const node = buildNode(ctx, { type: 'shape', shape: 'rectangle', position: { x: i * 10, y: 0 } });
    nodes[node.id] = node;
    nodeIds.push(node.id);
  }
  const empty = createEmptyDocument({ id: ids.document(), schemaVersion: CURRENT_SCHEMA_VERSION, clock });
  const doc: DiagramDocument = { ...empty, nodes };
  return { runtime: new DiagramRuntime(doc, { ids, clock, origin: 'load' }), firstId: nodeIds[0]! };
}

describe('large diagram', () => {
  it('executes and undoes a single operation on a 2000-node document', () => {
    const { runtime, firstId } = buildLargeRuntime(2000);
    const before = runtime.getDocument();

    runtime.execute(moveNode(firstId, { x: 0, y: 500 }));
    expect(runtime.getDocument().nodes[firstId]?.position).toEqual({ x: 0, y: 500 });

    runtime.undo();
    expect(equals(runtime.getDocument(), before)).toBe(true);
    expect(Object.keys(runtime.getDocument().nodes)).toHaveLength(2000);
  });
});
