import { describe, it, expect } from 'vitest';
import { validateEditPlan, detectConflicts } from '../validateEditPlan';
import { resolveColor, styleHintsToStyle } from '../editStyling';
import type { EditPlan } from '../model/EditPlan';
import type { EditPreview } from '../preview';

describe('validateEditPlan', () => {
  it('accepts a coherent plan', () => {
    const plan: EditPlan = { edits: [{ op: 'rename_node', target: { by: 'id', id: 'a' }, label: 'B' }] };
    expect(validateEditPlan(plan).ok).toBe(true);
  });

  it('rejects duplicate new-node refs', () => {
    const plan: EditPlan = {
      edits: [
        { op: 'add_node', ref: 'x', label: 'X' },
        { op: 'add_node', ref: 'x', label: 'Y' },
      ],
    };
    const r = validateEditPlan(plan);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'duplicate_ref')).toBe(true);
  });

  it('rejects a dangling `new` reference', () => {
    const plan: EditPlan = { edits: [{ op: 'connect', source: { by: 'new', ref: 'ghost' }, target: { by: 'id', id: 'a' } }] };
    const r = validateEditPlan(plan);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'dangling_new_ref')).toBe(true);
  });

  it('warns on a self-connection', () => {
    const plan: EditPlan = { edits: [{ op: 'connect', source: { by: 'id', id: 'a' }, target: { by: 'id', id: 'a' } }] };
    const r = validateEditPlan(plan);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === 'self_connection')).toBe(true);
  });
});

describe('detectConflicts', () => {
  it('flags modifying a node the same plan deletes', () => {
    const preview: EditPreview = {
      changes: [
        { kind: 'remove', summary: 'Delete X', targetIds: ['n1'] },
        { kind: 'rename', summary: 'Rename X', targetIds: ['n1'] },
      ],
      affectedIds: ['n1'],
      operationCount: 2,
    };
    expect(detectConflicts(preview).some((c) => c.code === 'conflicting_edit')).toBe(true);
  });
});

describe('editStyling', () => {
  it('resolves colour names and hex, rejects unknown', () => {
    expect(resolveColor('blue')).toBe('#3b82f6');
    expect(resolveColor('#abc')).toBe('#abc');
    expect(resolveColor('light blue')).toBe('#3b82f6');
    expect(resolveColor('nonsense')).toBeUndefined();
  });

  it('maps a named fill to a tinted background with a matching stroke', () => {
    const style = styleHintsToStyle({ fill: 'blue' });
    expect(style.fill?.color).toBe('#dbeafe');
    expect(style.stroke?.color).toBe('#3b82f6');
  });

  it('uses a hex fill verbatim', () => {
    expect(styleHintsToStyle({ fill: '#123456' }).fill?.color).toBe('#123456');
  });
});
