import { describe, it, expect } from 'vitest';
import { makeModel, makeConnectedModel } from './helpers';
import { validate } from '../validation/validate';
import { ValidationCode } from '../validation/codes';
import type { ValidationResult } from '../validation/codes';
import type { DiagramDocument } from '../model/document';
import type { NodeId, GroupId, StyleId, LayerId, TagId } from '../primitives/ids';

const codesOf = (r: ValidationResult): string[] => r.issues.map((i) => i.code);

describe('validation', () => {
  it('passes a well-formed document', () => {
    const { model } = makeConnectedModel();
    const result = model.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags a dangling edge endpoint', () => {
    const { model, edgeId } = makeConnectedModel();
    const doc = model.document;
    const edge = doc.edges[edgeId] as DiagramEdgeLike;
    const broken: DiagramDocument = {
      ...doc,
      edges: { ...doc.edges, [edgeId]: { ...edge, target: { nodeId: 'node_missing' as NodeId } } },
    };
    const result = validate(broken);
    expect(result.valid).toBe(false);
    expect(codesOf(result)).toContain(ValidationCode.DanglingEdgeEndpoint);
  });

  it('flags an id/key mismatch', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'rectangle' });
    const doc = model.document;
    const entity = doc.nodes[node.id];
    const broken: DiagramDocument = { ...doc, nodes: { wrongKey: entity as NonNullable<typeof entity> } };
    expect(codesOf(validate(broken))).toContain(ValidationCode.IdKeyMismatch);
  });

  it('flags an id reused across collections', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'rectangle' });
    const group = model.createGroup();
    const doc = model.document;
    const grp = doc.groups[group.id];
    const dupId = node.id as string;
    const broken: DiagramDocument = {
      ...doc,
      groups: { [dupId]: { ...(grp as NonNullable<typeof grp>), id: dupId as unknown as GroupId } },
    };
    expect(codesOf(validate(broken))).toContain(ValidationCode.DuplicateId);
  });

  it('flags an unresolved style / layer / tag reference', () => {
    const model = makeModel();
    model.createNode({
      type: 'shape',
      shape: 'rectangle',
      styleRef: 'style_missing' as StyleId,
      layerId: 'layer_missing' as LayerId,
      tagIds: ['tag_missing' as TagId],
    });
    const codes = codesOf(model.validate());
    expect(codes).toContain(ValidationCode.UnresolvedStyleRef);
    expect(codes).toContain(ValidationCode.UnresolvedLayerRef);
    expect(codes).toContain(ValidationCode.UnresolvedTagRef);
  });

  it('flags a missing group child and container child', () => {
    const model = makeModel();
    model.createGroup({ childIds: ['node_missing' as NodeId] });
    model.createNode({ type: 'container', childIds: ['node_missing' as NodeId] });
    const codes = codesOf(model.validate());
    expect(codes).toContain(ValidationCode.MissingGroupChild);
    expect(codes).toContain(ValidationCode.MissingContainerChild);
  });

  it('detects circular group nesting', () => {
    const model = makeModel();
    const g1 = model.createGroup({ name: 'g1' });
    const g2 = model.createGroup({ name: 'g2' });
    model.addToGroup(g1.id, g2.id);
    model.addToGroup(g2.id, g1.id); // cycle
    const result = model.validate();
    expect(result.valid).toBe(false);
    expect(codesOf(result)).toContain(ValidationCode.CircularGroup);
  });

  it('detects a self-referential group', () => {
    const model = makeModel();
    const g = model.createGroup();
    model.addToGroup(g.id, g.id);
    expect(codesOf(model.validate())).toContain(ValidationCode.CircularGroup);
  });

  it('treats an orphaned annotation target as a warning, not an error', () => {
    const model = makeModel();
    model.createAnnotation({ target: { kind: 'node', nodeId: 'node_missing' as NodeId }, text: 'x' });
    const result = model.validate();
    expect(result.valid).toBe(true); // warnings don't invalidate
    expect(codesOf(result)).toContain(ValidationCode.OrphanTarget);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// Minimal structural stand-in for tests that patch an edge.
type DiagramEdgeLike = DiagramDocument['edges'][string];
