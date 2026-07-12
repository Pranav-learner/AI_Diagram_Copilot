import { describe, it, expect } from 'vitest';
import { EditExecutionPlanner } from '../EditExecutionPlanner';
import type { EditPlan } from '../model/EditPlan';
import { sampleDiagram, understanding } from './helpers';
import { createDefaultOperationRegistry } from '@/diagram-engine';

const KNOWN = new Set(createDefaultOperationRegistry().types());
const { doc, ids } = sampleDiagram();
const u = (selection: string[] = []) => understanding(doc, selection);

function compile(plan: EditPlan, selection: string[] = []) {
  return new EditExecutionPlanner().compile(plan, u(selection));
}

describe('EditExecutionPlanner', () => {
  it('add-between compiles to node.create + two edge.connect (with new-ref wiring)', () => {
    const plan: EditPlan = {
      edits: [
        { op: 'add_node', ref: 'redis', label: 'Redis', nodeType: 'cache', near: { by: 'label', label: 'API' }, direction: 'right' },
        { op: 'connect', source: { by: 'label', label: 'API' }, target: { by: 'new', ref: 'redis' } },
        { op: 'connect', source: { by: 'new', ref: 'redis' }, target: { by: 'label', label: 'Database' } },
      ],
    };
    const { operations, preview, clarifications, issues } = compile(plan);
    expect(clarifications).toHaveLength(0);
    expect(issues).toHaveLength(0);
    const types = operations.operations.map((o) => o.type);
    expect(types).toEqual(['node.create', 'edge.connect', 'edge.connect']);
    // The two edges reference the minted node id (the 'new' ref resolved consistently).
    const newId = operations.operations[0]!.params.id;
    expect(operations.operations[1]!.params.target).toBe(newId);
    expect(operations.operations[2]!.params.source).toBe(newId);
    expect(preview.changes.map((c) => c.kind)).toEqual(['add', 'connect', 'connect']);
  });

  it('rename / remove / reorder compile to the right operations', () => {
    const rename = compile({ edits: [{ op: 'rename_node', target: { by: 'label', label: 'API' }, label: 'Edge Gateway' }] });
    expect(rename.operations.operations[0]).toMatchObject({ type: 'node.rename', params: { id: ids.api, text: 'Edge Gateway' } });

    const remove = compile({ edits: [{ op: 'remove_node', target: { by: 'label', label: 'Database' } }] });
    expect(remove.operations.operations[0]).toMatchObject({ type: 'node.delete', params: { id: ids.db } });

    const reorder = compile({ edits: [{ op: 'reorder', target: { by: 'label', label: 'API' }, position: 'front' }] });
    expect(reorder.operations.operations[0]!.type).toBe('node.update');
  });

  it('move relative-to computes a position below the anchor (no coords from the model)', () => {
    const plan: EditPlan = {
      edits: [{ op: 'move_node', target: { by: 'label', label: 'Auth Service' }, to: { relativeTo: { by: 'label', label: 'Database' }, direction: 'below' } }],
    };
    const op = compile(plan).operations.operations[0]!;
    expect(op.type).toBe('node.move');
    const pos = op.params.position as { x: number; y: number };
    // Database is at y=200 h=80 → below ≈ y 340.
    expect(pos.y).toBeGreaterThan(260);
  });

  it('recolour with a plural descriptor styles every matching node', () => {
    const plan: EditPlan = { edits: [{ op: 'update_style', targets: [{ by: 'descriptor', text: 'service' }], style: { fill: 'blue' } }] };
    const { operations } = compile(plan);
    expect(operations.operations).toHaveLength(2); // both services
    expect(operations.operations.every((o) => o.type === 'node.style')).toBe(true);
    const style = operations.operations[0]!.params.style as { fill?: { color: string } };
    expect(style.fill?.color).toBeDefined();
  });

  it('disconnect resolves the edge between two nodes', () => {
    const plan: EditPlan = { edits: [{ op: 'disconnect', source: { by: 'label', label: 'API' }, target: { by: 'label', label: 'Database' } }] };
    const { operations } = compile(plan);
    expect(operations.operations[0]!.type).toBe('edge.disconnect');
  });

  it('group compiles to group.create with resolved child ids', () => {
    const plan: EditPlan = { edits: [{ op: 'group', targets: [{ by: 'label', label: 'Auth Service' }, { by: 'label', label: 'Catalog Service' }], label: 'Services' }] };
    const op = compile(plan).operations.operations[0]!;
    expect(op.type).toBe('group.create');
    expect((op.params.spec as { childIds: string[] }).childIds).toEqual([ids.auth, ids.catalog]);
  });

  it('raises a clarification for an ambiguous singular reference (never guesses)', () => {
    const plan: EditPlan = { edits: [{ op: 'remove_node', target: { by: 'descriptor', text: 'service' } }] };
    const { clarifications, operations } = compile(plan);
    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]!.candidates).toHaveLength(2);
    expect(operations.operations).toHaveLength(0); // nothing emitted for the ambiguous edit
  });

  it('raises an error issue for an unknown reference', () => {
    const plan: EditPlan = { edits: [{ op: 'remove_node', target: { by: 'label', label: 'Kafka' } }] };
    const { issues } = compile(plan);
    expect(issues.some((i) => i.code === 'unknown_reference' && i.severity === 'error')).toBe(true);
  });

  it('only emits operations the runtime registry knows', () => {
    const plan: EditPlan = {
      edits: [
        { op: 'add_node', ref: 'x', label: 'X', near: { by: 'selection' } },
        { op: 'rename_node', target: { by: 'label', label: 'API' }, label: 'Y' },
        { op: 'update_style', targets: [{ by: 'label', label: 'Database' }], style: { fill: 'green' } },
      ],
    };
    for (const op of compile(plan, [ids.api!]).operations.operations) expect(KNOWN.has(op.type)).toBe(true);
  });
});
