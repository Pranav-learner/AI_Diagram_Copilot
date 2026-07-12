import { describe, it, expect } from 'vitest';
import { makeConnectedModel } from './helpers';
import { InMemoryDiagramRepository } from '../repository/InMemoryDiagramRepository';
import { equals } from '../serialization/equals';
import { DiagramValidationError } from '../core/errors';
import type { DiagramDocument } from '../model/document';
import type { NodeId } from '../primitives/ids';

describe('InMemoryDiagramRepository', () => {
  it('saves, loads, lists, and deletes documents', async () => {
    const repo = new InMemoryDiagramRepository();
    const { model } = makeConnectedModel();
    const doc = model.document;

    await repo.save(doc);
    expect(await repo.list()).toEqual([doc.id]);

    const loaded = await repo.load(doc.id);
    expect(loaded).not.toBeNull();
    expect(equals(loaded, doc)).toBe(true);

    await repo.delete(doc.id);
    expect(await repo.load(doc.id)).toBeNull();
    expect(await repo.list()).toEqual([]);
  });

  it('returns null for an unknown id', async () => {
    const repo = new InMemoryDiagramRepository();
    expect(await repo.load('nope')).toBeNull();
  });

  it('refuses to persist an invalid document', async () => {
    const repo = new InMemoryDiagramRepository();
    const { model, edgeId } = makeConnectedModel();
    const doc = model.document;
    const edge = doc.edges[edgeId] as DiagramDocument['edges'][string];
    const broken: DiagramDocument = {
      ...doc,
      edges: { ...doc.edges, [edgeId]: { ...edge, target: { nodeId: 'node_missing' as NodeId } } },
    };
    await expect(repo.save(broken)).rejects.toBeInstanceOf(DiagramValidationError);
  });
});
