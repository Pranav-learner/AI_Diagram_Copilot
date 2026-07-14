import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeModel, type DocumentRef } from '../pkm/ProjectKnowledgeModel';
import type { ExtractedEntity, ExtractedRelation } from '../extractors/types';

const docRef = (id: string): DocumentRef => ({ id, title: id, docType: 'markdown', contentHash: id, version: 1 });
const ev = (documentId: string, nodeId: string) => ({ documentId, nodeId, excerpt: 'x' });
const ent = (name: string, kind: string, documentId: string, nodeId: string, confidence = 0.6): ExtractedEntity => ({ name, kind, confidence, evidence: ev(documentId, nodeId) });
const rel = (sourceName: string, kind: string, targetName: string, documentId: string, nodeId: string): ExtractedRelation => ({ sourceName, kind, targetName, confidence: 0.6, evidence: ev(documentId, nodeId), sentence: `${sourceName} ${kind} ${targetName}` });

describe('ProjectKnowledgeModel — merging', () => {
  it('merges the same entity across documents and accumulates evidence', () => {
    const pkm = new ProjectKnowledgeModel();
    pkm.ingest(docRef('d1'), { entities: [ent('API Gateway', 'api', 'd1', 'n1', 0.6)], relations: [] });
    pkm.ingest(docRef('d2'), { entities: [ent('API Gateway', 'api', 'd2', 'n1', 0.8)], relations: [] });

    expect(pkm.entities()).toHaveLength(1);
    const e = pkm.find('API Gateway')!;
    expect(e.mentions).toBe(2);
    expect([...e.documentIds].sort()).toEqual(['d1', 'd2']);
    expect(e.confidence).toBe(0.8);
  });

  it('upgrades a generic concept to a specific kind', () => {
    const pkm = new ProjectKnowledgeModel();
    pkm.ingest(docRef('d1'), { entities: [ent('Orders', 'concept', 'd1', 'n1')], relations: [] });
    pkm.ingest(docRef('d1b'), { entities: [ent('Orders', 'service', 'd1b', 'n1')], relations: [] });
    expect(pkm.find('Orders')!.kind).toBe('service');
  });

  it('creates relation endpoints and strengthens repeated relations', () => {
    const pkm = new ProjectKnowledgeModel();
    pkm.ingest(docRef('d1'), { entities: [], relations: [rel('Orders Service', 'dependsOn', 'Database', 'd1', 'n1')] });
    pkm.ingest(docRef('d2'), { entities: [], relations: [rel('Orders Service', 'dependsOn', 'Database', 'd2', 'n2')] });
    expect(pkm.entities().length).toBe(2);
    expect(pkm.relations()).toHaveLength(1);
    expect(pkm.relations()[0]!.mentions).toBe(2);
    expect(pkm.neighbors(pkm.find('Orders Service')!.id).map((n) => n.name)).toContain('Database');
  });
});

describe('ProjectKnowledgeModel — incremental removal', () => {
  it('withdraws a document, keeping entities still evidenced elsewhere', () => {
    const pkm = new ProjectKnowledgeModel();
    pkm.ingest(docRef('d1'), { entities: [ent('Shared', 'concept', 'd1', 'n1'), ent('OnlyD1', 'concept', 'd1', 'n2')], relations: [] });
    pkm.ingest(docRef('d2'), { entities: [ent('Shared', 'concept', 'd2', 'n1')], relations: [] });

    pkm.removeDocument('d1');
    expect(pkm.find('OnlyD1')).toBeUndefined(); // only d1 → removed
    const shared = pkm.find('Shared')!;
    expect(shared.documentIds).toEqual(['d2']); // survives via d2
    expect(shared.mentions).toBe(1);

    pkm.removeDocument('d2');
    expect(pkm.find('Shared')).toBeUndefined();
    expect(pkm.entities()).toHaveLength(0);
  });

  it('removes relations when an endpoint is withdrawn', () => {
    const pkm = new ProjectKnowledgeModel();
    pkm.ingest(docRef('d1'), { entities: [], relations: [rel('A Service', 'uses', 'B Cache', 'd1', 'n1')] });
    expect(pkm.relations()).toHaveLength(1);
    pkm.removeDocument('d1');
    expect(pkm.relations()).toHaveLength(0);
    expect(pkm.entities()).toHaveLength(0);
  });
});
