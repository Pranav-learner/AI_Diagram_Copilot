import { describe, it, expect } from 'vitest';
import { makeArchitecture } from './helpers';
import { buildSemanticGraph, assembleGraph } from '../build/SemanticGraphBuilder';
import { validateSemanticGraph } from '../validation/validateGraph';
import type { SemanticRelationship } from '../model/relationship';
import type { SemanticGroup } from '../model/group';

describe('validateSemanticGraph', () => {
  it('passes a well-formed graph', () => {
    const { model } = makeArchitecture();
    const report = validateSemanticGraph(buildSemanticGraph(model.document));
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('flags broken relationship references', () => {
    const { model, ids } = makeArchitecture();
    const g = buildSemanticGraph(model.document);
    const bad: SemanticRelationship = { id: 'bad', kind: 'dependsOn', source: ids.svcA, target: 'ghost', directed: true, tags: [], attributes: {}, inferred: false };
    const rels = new Map(g.relationships);
    rels.set('bad', bad);
    const g2 = assembleGraph(g.documentId, g.version, new Map(g.entities), rels, new Map(g.groups));
    const report = validateSemanticGraph(g2);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === 'broken-reference')).toBe(true);
  });

  it('flags circular ownership and duplicate ids', () => {
    const g1: SemanticGroup = { id: 'g1', kind: 'group', label: 'G1', memberIds: [], childGroupIds: ['g2'], attributes: {}, synthetic: false };
    const g2: SemanticGroup = { id: 'g2', kind: 'group', label: 'G2', memberIds: [], childGroupIds: ['g1'], attributes: {}, synthetic: false };
    const graph = assembleGraph('d', 0, new Map(), new Map(), new Map([['g1', g1], ['g2', g2]]));
    const report = validateSemanticGraph(graph);
    expect(report.errors.some((e) => e.code === 'circular-ownership')).toBe(true);
  });

  it('warns on self-loops', () => {
    const { model, ids } = makeArchitecture();
    model.createEdge({ source: { nodeId: ids.db }, target: { nodeId: ids.db } });
    const report = validateSemanticGraph(buildSemanticGraph(model.document));
    expect(report.warnings.some((w) => w.code === 'self-loop')).toBe(true);
  });
});
