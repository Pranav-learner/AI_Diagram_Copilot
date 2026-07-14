import { describe, it, expect } from 'vitest';
import { makeArchitecture, makeModel } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { inferEntityKind, inferRelationshipKind } from '../build/classify';
import { categoryOf } from '../model/entity';

describe('SemanticGraphBuilder', () => {
  it('compiles a DSL document into a Semantic Graph', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document, 1);

    expect(graph.documentId).toBe('doc-test');
    expect(graph.version).toBe(1);
    expect(graph.entities.size).toBe(6);
    expect(graph.relationships.size).toBe(6);
    expect(graph.groups.size).toBe(1);

    const gateway = graph.entities.get(ids.gateway)!;
    expect(gateway.kind).toBe('gateway');
    expect(gateway.category).toBe('network');
    expect(gateway.label).toBe('API Gateway');
    expect(gateway.inferred).toBe(false);
    expect(gateway.geometry.area).toBe(160 * 80);
    expect(gateway.geometry.cx).toBe(280);
  });

  it('classifies kinds from semantic role, shape, then structure', () => {
    const model = makeModel();
    const roleNode = model.createNode({ type: 'shape', semantic: 'database' });
    const shapeNode = model.createNode({ type: 'shape', shape: 'cylinder' });
    const plainNode = model.createNode({ type: 'shape', shape: 'rectangle' });
    const textNode = model.createNode({ type: 'text', text: 'hello' });

    expect(inferEntityKind(model.document.nodes[roleNode.id]!)).toEqual({ kind: 'database', inferred: false });
    expect(inferEntityKind(model.document.nodes[shapeNode.id]!)).toEqual({ kind: 'database', inferred: true });
    expect(inferEntityKind(model.document.nodes[plainNode.id]!)).toEqual({ kind: 'unknown', inferred: true });
    expect(inferEntityKind(model.document.nodes[textNode.id]!)).toEqual({ kind: 'text', inferred: false });
  });

  it('preserves unknown-but-explicit roles verbatim', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', semantic: 'kafka-topic' as never });
    const { kind, inferred } = inferEntityKind(model.document.nodes[node.id]!);
    expect(kind).toBe('kafka-topic');
    expect(inferred).toBe(false);
    expect(categoryOf(kind)).toBe('other');
  });

  it('classifies relationships from relType hints', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const rels = [...graph.relationships.values()];
    const depRel = rels.find((r) => r.source === ids.gateway && r.target === ids.svcA)!;
    expect(depRel.kind).toBe('dependsOn');
    expect(depRel.directed).toBe(true);
    const flowRel = rels.find((r) => r.source === ids.user)!;
    expect(flowRel.kind).toBe('flowsTo');
  });

  it('falls back to flowsTo/connectsTo when no hint is present', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape' });
    const b = model.createNode({ type: 'shape' });
    const directed = model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id } });
    const undirected = model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, arrowheads: { start: 'none', end: 'none' } });
    expect(inferRelationshipKind(model.document.edges[directed.id]!).kind).toBe('flowsTo');
    expect(inferRelationshipKind(model.document.edges[undirected.id]!).kind).toBe('connectsTo');
  });

  it('resolves tags and group membership', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const svcA = graph.entities.get(ids.svcA)!;
    expect(svcA.tags).toEqual(['public']);
    expect(svcA.groupId).toBe(ids.backend);
    const backend = graph.groups.get(ids.backend)!;
    expect(backend.memberIds).toContain(ids.svcA);
    expect(backend.memberIds).toHaveLength(4);
  });

  it('derives ports from edge endpoints', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape' });
    const b = model.createNode({ type: 'shape' });
    model.createEdge({ source: { nodeId: a.id, port: 'p-out' as never }, target: { nodeId: b.id, anchor: 'left' } });
    const graph = buildSemanticGraph(model.document);
    expect(graph.entities.get(a.id)!.ports.map((p) => p.id)).toEqual(['p-out']);
    expect(graph.entities.get(b.id)!.ports[0]!.anchor).toBe('left');
  });

  it('computes stats including cycles and components', () => {
    const { model } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    expect(graph.stats.entityCount).toBe(6);
    expect(graph.stats.relationshipCount).toBe(6);
    expect(graph.stats.componentCount).toBe(1);
    expect(graph.stats.hasCycles).toBe(false);
    expect(graph.stats.isolatedCount).toBe(0);
    expect(graph.stats.densestEntityId).toBeDefined();
  });

  it('detects cycles', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape' });
    const b = model.createNode({ type: 'shape' });
    const c = model.createNode({ type: 'shape' });
    model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id } });
    model.createEdge({ source: { nodeId: b.id }, target: { nodeId: c.id } });
    model.createEdge({ source: { nodeId: c.id }, target: { nodeId: a.id } });
    expect(buildSemanticGraph(model.document).stats.hasCycles).toBe(true);
  });
});
