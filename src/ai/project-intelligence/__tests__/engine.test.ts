import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeModel } from '../../knowledge';
import type { SemanticGraph } from '../../understanding';
import { ProjectIntelligenceEngine } from '../ProjectIntelligenceEngine';
import { populate, type EntitySpec } from './helpers';

const SEED: EntitySpec[] = [
  { name: 'AuthService', kind: 'service', origin: 'code' },
  { name: 'auth-service', kind: 'container', origin: 'infrastructure' },
];

/** A tiny hand-built semantic graph (only the fields the adapter reads). */
function graph(): SemanticGraph {
  const entities = new Map<string, unknown>([
    ['n1', { id: 'n1', label: 'Checkout', kind: 'service', tags: [], inferred: false }],
    ['n2', { id: 'n2', label: 'Ledger', kind: 'database', tags: [], inferred: false }],
  ]);
  const relationships = new Map<string, unknown>([
    ['e1', { id: 'e1', source: 'n1', target: 'n2', kind: 'dependsOn', inferred: false }],
  ]);
  return { entities, relationships } as unknown as SemanticGraph;
}

describe('ProjectIntelligenceEngine', () => {
  it('builds a PIM lazily from an injected shared PKM', () => {
    const pkm = new ProjectKnowledgeModel();
    populate(pkm, SEED);
    const engine = new ProjectIntelligenceEngine({ pkm });
    const pim = engine.getPIM();
    expect(pim.findByName('AuthService')).toBeDefined();
    expect([...pim.findByName('AuthService')!.sourceKinds].sort()).toEqual(['code', 'infrastructure']);
  });

  it('caches the PIM and only rebuilds when the PKM changes (incremental)', () => {
    const pkm = new ProjectKnowledgeModel();
    populate(pkm, SEED);
    const engine = new ProjectIntelligenceEngine({ pkm });

    const first = engine.getPIM();
    expect(engine.getPIM()).toBe(first); // unchanged PKM ⇒ same snapshot
    expect(engine.refresh()).toBe(false);

    populate(pkm, [{ name: 'BillingService', kind: 'service', origin: 'code' }]);
    const rebuilt = engine.getPIM();
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.findByName('BillingService')).toBeDefined();
  });

  it('notifies update listeners on rebuild', () => {
    const pkm = new ProjectKnowledgeModel();
    populate(pkm, SEED);
    const engine = new ProjectIntelligenceEngine({ pkm });
    let events = 0;
    engine.onUpdate(() => events++);
    engine.getPIM();
    populate(pkm, [{ name: 'X', kind: 'service', origin: 'code' }]);
    engine.refresh();
    expect(events).toBe(2);
  });

  it('ingests an existing diagram into the shared PKM and fuses it', () => {
    const engine = new ProjectIntelligenceEngine();
    engine.ingestDiagram({ id: 'main', graph: graph() });
    const pim = engine.getPIM();
    const checkout = pim.findByName('Checkout')!;
    expect(checkout).toBeDefined();
    expect(checkout.sourceKinds).toContain('diagram');
    // The diagram-only element is flagged as a potentially-outdated diagram.
    expect(pim.conflicts().some((c) => c.kind === 'outdated-diagram')).toBe(true);
  });

  it('re-ingesting an unchanged diagram is a no-op', () => {
    const engine = new ProjectIntelligenceEngine();
    engine.ingestDiagram({ id: 'main', graph: graph() });
    const v = engine.knowledge().version;
    engine.ingestDiagram({ id: 'main', graph: graph() });
    expect(engine.knowledge().version).toBe(v);
  });

  it('exposes topology, search, cross-references, validation, and stats', () => {
    const engine = new ProjectIntelligenceEngine();
    engine.ingestDiagram({ id: 'main', graph: graph() });
    expect(engine.getTopology('dependency').edges.length).toBeGreaterThan(0);
    expect(engine.search({ text: 'checkout' }).length).toBeGreaterThan(0);
    expect(engine.validate().ok).toBe(true);
    expect(engine.stats().entities).toBeGreaterThan(0);
    const q = engine.query();
    expect(q.findDependencies('Checkout').map((e) => e.name)).toContain('Ledger');
  });
});
