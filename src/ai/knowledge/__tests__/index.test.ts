import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeModel, type DocumentRef } from '../pkm/ProjectKnowledgeModel';
import { KnowledgeIndex } from '../pkm/KnowledgeIndex';
import { DocumentIndexer } from '../documents/DocumentIndexer';
import { parseDocument } from '../documents/DocumentParser';
import { ARCHITECTURE_DOC } from './helpers';

const docRef = (id: string): DocumentRef => ({ id, title: id, docType: 'markdown', contentHash: id, version: 1 });
const ev = (documentId: string, nodeId: string) => ({ documentId, nodeId, excerpt: 'x' });

describe('KnowledgeIndex', () => {
  it('indexes entities by kind, tag, document, and token', () => {
    const pkm = new ProjectKnowledgeModel();
    pkm.ingest(docRef('d1'), {
      entities: [
        { name: 'Auth Service', kind: 'service', confidence: 0.7, tags: ['critical'], evidence: ev('d1', 'n1') },
        { name: 'Postgres', kind: 'database', confidence: 0.7, evidence: ev('d1', 'n2') },
      ],
      relations: [],
    });
    const idx = KnowledgeIndex.build(pkm);
    expect(idx.byKind('service')).toHaveLength(1);
    expect(idx.byKind('database')).toHaveLength(1);
    expect(idx.byTag('critical')).toHaveLength(1);
    expect(idx.byDocument('d1')).toHaveLength(2);
    expect(idx.byToken('auth').length).toBeGreaterThan(0);
    expect(idx.version).toBe(pkm.version);
  });
});

describe('DocumentIndexer', () => {
  it('adds, searches, and incrementally removes documents', () => {
    const idx = new DocumentIndexer();
    const doc = parseDocument({ name: 'architecture.md', content: ARCHITECTURE_DOC });
    idx.add(doc);
    expect(idx.documentCount).toBe(1);
    expect(idx.searchDocuments('redis caching').some((r) => r.documentId === doc.id)).toBe(true);
    expect(idx.headingsOf(doc.id).some((h) => h.heading === 'Components')).toBe(true);

    idx.remove(doc.id);
    expect(idx.documentCount).toBe(0);
    expect(idx.searchDocuments('redis')).toHaveLength(0);
  });

  it('re-adding a document replaces its postings', () => {
    const idx = new DocumentIndexer();
    idx.add(parseDocument({ name: 'x.md', content: '# X\n\napple banana' }));
    idx.add(parseDocument({ name: 'x.md', content: '# X\n\ncherry' }));
    expect(idx.searchDocuments('apple')).toHaveLength(0);
    expect(idx.searchDocuments('cherry')).toHaveLength(1);
  });
});
