import { describe, it, expect } from 'vitest';
import { DiagramPlanSchema } from '../model/DiagramPlan';
import { validatePlan } from '../validation/validatePlan';
import { samplePlan } from './helpers';

describe('DiagramPlanSchema', () => {
  it('accepts a well-formed plan', () => {
    const result = DiagramPlanSchema.safeParse(samplePlan());
    expect(result.success).toBe(true);
  });

  it('rejects an empty node list', () => {
    const result = DiagramPlanSchema.safeParse({ diagramType: 'flowchart', title: 'X', nodes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown diagram type', () => {
    const result = DiagramPlanSchema.safeParse({ diagramType: 'pie', title: 'X', nodes: [{ id: 'a', label: 'A' }] });
    expect(result.success).toBe(false);
  });

  it('defaults relationships to an empty array', () => {
    const parsed = DiagramPlanSchema.parse({ diagramType: 'mindmap', title: 'X', nodes: [{ id: 'a', label: 'A' }] });
    expect(parsed.relationships).toEqual([]);
  });
});

describe('validatePlan (semantic)', () => {
  it('passes a coherent plan', () => {
    const result = validatePlan(samplePlan());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags duplicate node ids', () => {
    const plan = samplePlan({ nodes: [
      { id: 'a', label: 'A' },
      { id: 'a', label: 'A2' },
    ], relationships: [] });
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'duplicate_node')).toBe(true);
  });

  it('flags relationships that reference unknown nodes', () => {
    const plan = samplePlan({ relationships: [{ source: 'a', target: 'ghost' }] });
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'dangling_relationship')).toBe(true);
  });

  it('flags group members that do not exist', () => {
    const plan = samplePlan({ groups: [{ id: 'g', label: 'G', nodeIds: ['a', 'missing'] }] });
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'invalid_group_member')).toBe(true);
  });

  it('warns (does not reject) on a multi-node diagram with no relationships', () => {
    const plan = samplePlan({ nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ], relationships: [] });
    const result = validatePlan(plan);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === 'no_relationships')).toBe(true);
  });

  it('does not warn about missing relationships for inherently linear types', () => {
    const plan = samplePlan({ diagramType: 'timeline', nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ], relationships: [] });
    expect(validatePlan(plan).warnings.some((w) => w.code === 'no_relationships')).toBe(false);
  });
});
