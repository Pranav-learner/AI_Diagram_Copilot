import { describe, it, expect } from 'vitest';
import { DiagramModel } from '@/dsl';
import { DiagramRuntime } from '@/diagram-engine';
import type { DocumentPatch } from '@/diagram-engine';
import { summarizePatch, summaryRows, summaryTotal } from '../lib/operationSummary';

/** Capture the patch of a transaction run against a runtime — the real source. */
function patchOf(runtime: DiagramRuntime, fn: () => void): DocumentPatch | undefined {
  let patch: DocumentPatch | undefined;
  const off = runtime.events.on('transaction:committed', (e) => (patch = e.patch));
  fn();
  off();
  return patch;
}

function nodeSpec(label: string) {
  return { type: 'shape', shape: 'rectangle', label: { text: label }, position: { x: 0, y: 0 } };
}

describe('summarizePatch (operation summary from the runtime)', () => {
  it('counts created nodes and added connections', () => {
    const runtime = new DiagramRuntime(DiagramModel.create().document);
    const patch = patchOf(runtime, () =>
      runtime.transaction(() => {
        runtime.executeType('node.create', { id: 'a', spec: nodeSpec('A') });
        runtime.executeType('node.create', { id: 'b', spec: nodeSpec('B') });
        runtime.executeType('edge.connect', { source: 'a', target: 'b', spec: {} });
      }),
    );
    const summary = summarizePatch(patch, 42);
    expect(summary.nodesCreated).toBe(2);
    expect(summary.edgesAdded).toBe(1);
    expect(summary.executionTimeMs).toBe(42);
    expect(summaryTotal(summary)).toBe(3);
  });

  it('counts deleted nodes (and their cascaded edges)', () => {
    const model = DiagramModel.create();
    const a = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'A' }, position: { x: 0, y: 0 } });
    const b = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'B' }, position: { x: 0, y: 0 } });
    model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id } });
    const runtime = new DiagramRuntime(model.document);

    const patch = patchOf(runtime, () => runtime.executeType('node.delete', { id: a.id }));
    const summary = summarizePatch(patch, 1);
    expect(summary.nodesDeleted).toBe(1);
    expect(summary.edgesRemoved).toBe(1); // cascade
  });

  it('detects style changes as a subset of modifications', () => {
    const model = DiagramModel.create();
    const a = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'A' }, position: { x: 0, y: 0 } });
    const runtime = new DiagramRuntime(model.document);

    const patch = patchOf(runtime, () => runtime.executeType('node.style', { id: a.id, style: { fill: { color: '#ff0000' } } }));
    const summary = summarizePatch(patch, 1);
    expect(summary.nodesModified).toBe(1);
    expect(summary.stylesChanged).toBe(1);
  });

  it('counts created groups', () => {
    const model = DiagramModel.create();
    const a = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'A' }, position: { x: 0, y: 0 } });
    const runtime = new DiagramRuntime(model.document);
    const patch = patchOf(runtime, () => runtime.executeType('group.create', { id: 'g', spec: { name: 'G', childIds: [a.id] } }));
    expect(summarizePatch(patch, 1).groupsCreated).toBe(1);
  });

  it('handles an undefined patch (no changes)', () => {
    const summary = summarizePatch(undefined, 5);
    expect(summaryTotal(summary)).toBe(0);
    expect(summaryRows(summary)).toHaveLength(0);
    expect(summary.executionTimeMs).toBe(5);
  });

  it('summaryRows lists only non-zero rows', () => {
    const runtime = new DiagramRuntime(DiagramModel.create().document);
    const patch = patchOf(runtime, () => runtime.executeType('node.create', { id: 'x', spec: nodeSpec('X') }));
    const rows = summaryRows(summarizePatch(patch, 1));
    expect(rows).toEqual([{ label: 'Nodes created', value: 1 }]);
  });
});
