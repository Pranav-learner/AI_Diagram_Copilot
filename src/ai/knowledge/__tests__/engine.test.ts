import { describe, it, expect } from 'vitest';
import { DocumentIntelligenceEngine } from '../DocumentIntelligenceEngine';
import { DocumentIntelligenceError } from '../errors';
import { ARCHITECTURE_DOC, README_DOC } from './helpers';

function engineWithArch() {
  const engine = new DocumentIntelligenceEngine();
  const result = engine.ingest({ name: 'architecture.md', content: ARCHITECTURE_DOC });
  return { engine, result };
}

describe('DocumentIntelligenceEngine — ingest', () => {
  it('parses, classifies, extracts, and populates the PKM', () => {
    const { engine, result } = engineWithArch();
    expect(result.document.docType).toBe('architecture');
    expect(result.added.entities).toBeGreaterThan(0);
    expect(result.validation.ok).toBe(true);
    expect(result.cached).toBe(false);

    const pkm = engine.getPKM();
    expect(pkm.find('API Gateway')).toBeTruthy();
    expect(pkm.relations().some((r) => r.kind === 'dependsOn')).toBe(true);
    expect(pkm.byKind('requirement').length).toBeGreaterThanOrEqual(3);
    expect(pkm.byKind('decision').length).toBeGreaterThanOrEqual(1);
    expect(pkm.byKind('risk').length).toBeGreaterThanOrEqual(1);
  });

  it('no-ops on unchanged content and reports cache hits', () => {
    const { engine } = engineWithArch();
    const again = engine.ingest({ name: 'architecture.md', content: ARCHITECTURE_DOC });
    expect(again.cached).toBe(true);
    expect(engine.stats().parseCacheHits).toBeGreaterThanOrEqual(1);
    expect(engine.documents()).toHaveLength(1);
  });

  it('rejects empty documents', () => {
    const engine = new DocumentIntelligenceEngine();
    expect(() => engine.ingest({ name: 'empty.md', content: '   ' })).toThrow(DocumentIntelligenceError);
  });
});

describe('DocumentIntelligenceEngine — search', () => {
  it('supports keyword, tag, category, relationship, and document search', () => {
    const { engine } = engineWithArch();
    expect(engine.search({ text: 'gateway' }).some((h) => h.resultType === 'entity' && /gateway/i.test(h.title))).toBe(true);
    expect(engine.search({ type: 'tag', tag: 'must' }).length).toBeGreaterThan(0);
    expect(engine.search({ type: 'category', category: 'database' }).length).toBeGreaterThan(0);
    expect(engine.search({ type: 'relationship', text: 'depends' }).length).toBeGreaterThan(0);
    expect(engine.search({ type: 'document', text: 'redis' }).some((h) => h.resultType === 'document')).toBe(true);
  });
});

describe('DocumentIntelligenceEngine — summaries', () => {
  it('produces document, architecture, requirement, and entity summaries', () => {
    const { engine, result } = engineWithArch();
    const docSummary = engine.summarizeDocument(result.document.id)!;
    expect(docSummary.docType).toBe('architecture');
    expect(docSummary.requirementCount).toBeGreaterThanOrEqual(3);
    expect(docSummary.topEntities.length).toBeGreaterThan(0);

    expect(engine.summarizeArchitecture().systems.length).toBeGreaterThan(0);
    expect(engine.summarizeRequirements().total).toBeGreaterThanOrEqual(3);

    const gateway = engine.getPKM().find('API Gateway')!;
    expect(engine.summarizeEntity(gateway.id)!.name).toBe('API Gateway');
  });

  it('caches summaries and reuses them until the region changes', () => {
    const { engine, result } = engineWithArch();
    const a = engine.summarizeDocument(result.document.id);
    const b = engine.summarizeDocument(result.document.id);
    expect(a).toBe(b); // same cached object
  });
});

describe('DocumentIntelligenceEngine — incremental updates', () => {
  it('re-ingests a changed document, withdrawing stale knowledge', () => {
    const engine = new DocumentIntelligenceEngine();
    engine.ingest({ name: 'sys.md', content: '# Sys\n\n## C\n\n- The Alpha Service uses the Beta Cache.\n' });
    expect(engine.getPKM().find('Alpha Service')).toBeTruthy();

    const updated = engine.ingest({ name: 'sys.md', content: '# Sys\n\n## C\n\n- The Gamma Service uses the Delta Cache.\n' });
    expect(updated.document.version).toBe(2);
    expect(engine.getPKM().find('Alpha Service')).toBeUndefined();
    expect(engine.getPKM().find('Gamma Service')).toBeTruthy();
    expect(engine.documents()).toHaveLength(1);
  });

  it('removes a document and its unique contributions', () => {
    const { engine, result } = engineWithArch();
    engine.ingest({ name: 'README.md', content: README_DOC });
    expect(engine.documents()).toHaveLength(2);

    engine.remove(result.document.id);
    expect(engine.documents()).toHaveLength(1);
    expect(engine.getPKM().find('API Gateway')).toBeUndefined();
    expect(engine.validatePkm().ok).toBe(true);
  });

  it('notifies listeners on ingest and removal', () => {
    const engine = new DocumentIntelligenceEngine();
    const events: string[] = [];
    engine.onUpdate((e) => events.push(e.change));
    const r = engine.ingest({ name: 'x.md', content: README_DOC });
    engine.remove(r.document.id);
    expect(events).toEqual(['ingested', 'removed']);
  });
});
