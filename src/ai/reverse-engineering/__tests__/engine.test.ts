import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeModel, DocumentIntelligenceEngine } from '@/ai';
import { ReverseEngineeringEngine } from '../ReverseEngineeringEngine';
import { TS_SERVICE, COMPOSE, SQL_SCHEMA, OPENAPI } from './helpers';

function repo() {
  const engine = new ReverseEngineeringEngine();
  engine.addFiles([
    { path: 'src/user.service.ts', content: TS_SERVICE },
    { path: 'docker-compose.yml', content: COMPOSE },
    { path: 'db/schema.sql', content: SQL_SCHEMA },
    { path: 'api/openapi.yaml', content: OPENAPI },
  ]);
  return engine;
}

describe('ReverseEngineeringEngine — ingest + graph', () => {
  it('parses a mixed repository into a Code Knowledge Graph', () => {
    const engine = repo();
    const stats = engine.stats();
    expect(stats.parsed).toBe(4);
    expect(stats.failed).toBe(0);
    expect(stats.entities).toBeGreaterThan(0);
    expect(engine.getGraph().byKind('database').some((d) => d.name === 'db')).toBe(true);
    expect(engine.getGraph().byKind('endpoint').length).toBeGreaterThan(0);
    expect(engine.getGraph().byKind('table').some((t) => t.name === 'users')).toBe(true);
  });

  it('merges architecture-significant entities into the PKM (docs + code unified)', () => {
    const engine = repo();
    const pkm = engine.getPKM();
    expect(pkm.byKind('service').length).toBeGreaterThan(0);
    expect(pkm.byKind('database').length).toBeGreaterThan(0);
    expect(pkm.byKind('api').length).toBeGreaterThan(0);
    const svc = pkm.find('UserService');
    expect(svc?.attributes.origin).toBe('code');
    expect(svc?.attributes.language).toBe('typescript');
    // Skips granular symbols (methods/variables).
    expect(pkm.entities().every((e) => e.kind !== 'method')).toBe(true);
  });

  it('supports symbol / api / infrastructure / database search', () => {
    const engine = repo();
    expect(engine.search({ text: 'user', type: 'symbol' }).length).toBeGreaterThan(0);
    expect(engine.search({ type: 'api' }).length).toBeGreaterThan(0);
    expect(engine.search({ type: 'infrastructure' }).some((h) => h.name === 'db')).toBe(true);
    expect(engine.search({ type: 'database' }).some((h) => h.name === 'users')).toBe(true);
    expect(engine.search({ type: 'relationship', text: 'depends' }).length).toBeGreaterThanOrEqual(0);
  });

  it('validates cleanly (no dangling relations)', () => {
    expect(repo().validate().errors).toHaveLength(0);
  });
});

describe('ReverseEngineeringEngine — incremental', () => {
  it('re-parses only changed files and updates the graph + PKM', () => {
    const engine = new ReverseEngineeringEngine();
    engine.addFile('a.ts', 'export class Alpha {}');
    expect(engine.getGraph().entities().some((e) => e.name === 'Alpha')).toBe(true);

    engine.updateFile('a.ts', 'export class Gamma {}');
    expect(engine.getGraph().entities().some((e) => e.name === 'Alpha')).toBe(false);
    expect(engine.getGraph().entities().some((e) => e.name === 'Gamma')).toBe(true);
    expect(engine.getPKM().find('Alpha')).toBeUndefined();
    expect(engine.getPKM().find('Gamma')).toBeTruthy();
  });

  it('caches parses of unchanged content', () => {
    const engine = new ReverseEngineeringEngine();
    engine.addFile('a.ts', 'export class Alpha {}');
    engine.getGraph();
    const before = engine.getPKM().version;
    engine.addFile('a.ts', 'export class Alpha {}'); // identical → no-op
    engine.getGraph();
    expect(engine.getPKM().version).toBe(before); // PKM untouched
  });

  it('removes a file and withdraws its contributions', () => {
    const engine = repo();
    engine.getGraph();
    engine.removeFile('db/schema.sql');
    expect(engine.getGraph().byKind('table').length).toBe(0);
    expect(engine.getPKM().entities().some((e) => e.name === 'users')).toBe(false);
  });
});

describe('ReverseEngineeringEngine — PKM unification with documents', () => {
  it('shares one PKM with the Document Intelligence Engine', () => {
    const pkm = new ProjectKnowledgeModel();
    const docs = new DocumentIntelligenceEngine({ pkm });
    const code = new ReverseEngineeringEngine({ pkm });
    docs.ingest({ name: 'design.md', content: '# Design\n\nThe **UserService** owns user data.' });
    code.addFile('src/user.service.ts', TS_SERVICE);
    code.getGraph(); // trigger sync

    // One PKM now holds both a document-derived and a code-derived UserService (merged by name).
    const svc = pkm.find('UserService')!;
    expect(svc).toBeTruthy();
    expect(svc.documentIds.length).toBeGreaterThanOrEqual(1);
    expect(pkm.documents().length).toBeGreaterThanOrEqual(2);
  });
});
