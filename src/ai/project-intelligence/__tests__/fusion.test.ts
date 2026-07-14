import { describe, it, expect } from 'vitest';
import { fuse, type EntitySpec, type RelationSpec } from './helpers';
import { buildTopology } from '../pim/TopologyGraph';
import { PimQuery } from '../queries';
import { searchPim } from '../search';
import { crossReferences, buildReverseIndex } from '../crossref';
import { validatePim } from '../validation';

// A small but multi-source project used across the fusion tests. The same concept
// (UserService / user-service / "User Service") is described by code, infra, and docs.
const ENTITIES: EntitySpec[] = [
  { name: 'UserService', kind: 'service', origin: 'code' },
  { name: 'user-service', kind: 'container', origin: 'infrastructure' },
  { name: 'User Service', kind: 'service', origin: 'document' },
  { name: 'Reporting Service', kind: 'service', origin: 'document' }, // documented, never built
  { name: 'PaymentAPI v1', kind: 'api', origin: 'code' }, // version mismatch pair …
  { name: 'PaymentAPI v2', kind: 'api', origin: 'document' },
  { name: 'Orders', kind: 'service', origin: 'diagram' }, // in a diagram, nowhere else
  { name: 'MainDatabase', kind: 'database', origin: 'infrastructure' },
];
const RELATIONS: RelationSpec[] = [
  { from: 'UserService', to: 'MainDatabase', kind: 'dependsOn', origin: 'code' },
  { from: 'User Service', to: 'PaymentAPI v1', kind: 'dependsOn', origin: 'document' },
  { from: 'Team A', to: 'UserService', kind: 'owns', origin: 'document' },
  { from: 'Team B', to: 'UserService', kind: 'owns', origin: 'document' },
];

describe('entity resolution', () => {
  it('fuses one concept described across code, infrastructure, and docs into a single entity', () => {
    const pim = fuse(ENTITIES, RELATIONS);
    const user = pim.findByName('UserService');
    expect(user).toBeDefined();
    // Most human-readable surface form becomes the canonical name.
    expect(user!.name).toBe('User Service');
    // The other surface forms survive as aliases (traceability).
    expect(user!.aliases).toEqual(expect.arrayContaining(['UserService', 'user-service']));
    // All three source kinds are recorded.
    expect([...user!.sourceKinds].sort()).toEqual(['code', 'document', 'infrastructure']);
    // Canonical kind is the most specific (service > container).
    expect(user!.kind).toBe('service');
  });

  it('does not merge distinct concepts', () => {
    const pim = fuse(ENTITIES, RELATIONS);
    expect(pim.findByName('MainDatabase')!.id).not.toBe(pim.findByName('UserService')!.id);
    expect(pim.findByName('Reporting Service')).toBeDefined();
  });

  it('boosts confidence when multiple source kinds corroborate', () => {
    const single = fuse([{ name: 'Solo', kind: 'service', origin: 'code', confidence: 0.7 }]);
    const multi = fuse([
      { name: 'DupService', kind: 'service', origin: 'code', confidence: 0.7 },
      { name: 'dup-service', kind: 'container', origin: 'infrastructure', confidence: 0.7 },
    ]);
    expect(multi.findByName('DupService')!.confidence).toBeGreaterThan(single.findByName('Solo')!.confidence);
  });
});

describe('evidence preservation', () => {
  it('keeps traceable evidence from every source with origin, source, and method', () => {
    const pim = fuse(ENTITIES, RELATIONS);
    const user = pim.findByName('UserService')!;
    const origins = new Set(user.evidence.map((e) => e.origin));
    expect(origins).toEqual(new Set(['code', 'infrastructure', 'document']));
    for (const e of user.evidence) {
      expect(e.source).toBeTruthy();
      expect(e.method).toBeTruthy();
      expect(typeof e.confidence).toBe('number');
    }
  });

  it('deduplicates identical evidence records', () => {
    const pim = fuse([
      { name: 'Api', kind: 'api', origin: 'code' },
      { name: 'api', kind: 'api', origin: 'code' },
    ]);
    const api = pim.findByName('Api')!;
    const keys = api.evidence.map((e) => `${e.origin}:${e.source}:${e.location ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('conflict detection', () => {
  const pim = fuse(ENTITIES, RELATIONS);
  const kinds = new Set(pim.conflicts().map((c) => c.kind));

  it('flags a documented-but-unimplemented concept', () => {
    expect(kinds.has('missing-implementation')).toBe(true);
    const c = pim.conflicts().find((c) => c.kind === 'missing-implementation')!;
    expect(c.message).toContain('Reporting Service');
    expect(c.evidence.length).toBeGreaterThan(0);
  });
  it('flags a diagram element absent from code (outdated diagram)', () => {
    expect(kinds.has('outdated-diagram')).toBe(true);
  });
  it('flags conflicting versions across sources', () => {
    expect(kinds.has('version-mismatch')).toBe(true);
  });
  it('flags duplicated ownership', () => {
    const c = pim.conflicts().find((c) => c.kind === 'duplicate-ownership');
    expect(c).toBeDefined();
    expect(c!.entities.length).toBeGreaterThanOrEqual(3); // target + 2 owners
  });
});

describe('topology graphs', () => {
  const pim = fuse(ENTITIES, RELATIONS);
  it('projects a dependency graph', () => {
    const dep = buildTopology(pim, 'dependency');
    expect(dep.edges.length).toBeGreaterThan(0);
    expect(dep.edges.every((e) => ['dependsOn', 'calls', 'references'].includes(e.kind))).toBe(true);
  });
  it('projects an ownership graph', () => {
    const own = buildTopology(pim, 'ownership');
    expect(own.edges.every((e) => e.kind === 'owns')).toBe(true);
    expect(own.edges.length).toBe(2);
  });
  it('projects an infrastructure graph containing the database', () => {
    const infra = buildTopology(pim, 'infrastructure');
    expect(infra.nodes.some((n) => n.name === 'MainDatabase')).toBe(true);
  });
});

describe('query API', () => {
  const pim = fuse(ENTITIES, RELATIONS);
  const q = new PimQuery(pim);

  it('finds owners', () => {
    expect(q.findOwners('UserService').map((e) => e.name).sort()).toEqual(['Team A', 'Team B']);
  });
  it('finds direct dependencies and dependents', () => {
    const deps = q.findDependencies('UserService').map((e) => e.name);
    expect(deps).toEqual(expect.arrayContaining(['MainDatabase']));
    expect(q.findDependents('MainDatabase').map((e) => e.name)).toContain('User Service');
  });
  it('computes transitive downstream impact', () => {
    const impacted = q.downstreamImpact('MainDatabase').map((e) => e.name);
    expect(impacted).toContain('User Service');
  });
  it('returns evidence-typed implementation / documentation lookups', () => {
    expect(q.findImplementation('UserService').length).toBeGreaterThan(0);
    expect(q.relatedDocumentation('UserService').length).toBeGreaterThan(0);
  });
});

describe('cross-reference engine', () => {
  const pim = fuse(ENTITIES, RELATIONS);
  it('groups an entity’s evidence by source kind and lists neighbours', () => {
    const user = pim.findByName('UserService')!;
    const xref = crossReferences(pim, user.id)!;
    expect(Object.keys(xref.bySourceKind).sort()).toEqual(['code', 'document', 'infrastructure']);
    expect(xref.sources.length).toBeGreaterThanOrEqual(3);
    expect(xref.related.length).toBeGreaterThan(0);
  });
  it('builds a reverse index from source artifact to entities', () => {
    const index = buildReverseIndex(pim);
    expect(index.get('src/index.ts')!.some((e) => e.name === 'User Service')).toBe(true);
  });
});

describe('search', () => {
  const pim = fuse(ENTITIES, RELATIONS);
  it('ranks exact matches first', () => {
    const hits = searchPim(pim, { text: 'user service' });
    expect(hits[0]!.name).toBe('User Service');
  });
  it('filters by semantic type', () => {
    const services = searchPim(pim, { type: 'service' });
    expect(services.every((h) => ['service', 'module', 'component'].includes(h.kind))).toBe(true);
    expect(services.some((h) => h.name === 'User Service')).toBe(true);
  });
  it('finds diagram-sourced entities', () => {
    expect(searchPim(pim, { type: 'diagram' }).some((h) => h.name === 'Orders')).toBe(true);
  });
});

describe('validation', () => {
  it('reports a well-formed PIM as valid with no broken references', () => {
    const report = validatePim(fuse(ENTITIES, RELATIONS));
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
  });
});
