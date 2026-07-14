import { describe, it, expect } from 'vitest';
import { ProjectKnowledgeModel } from '../../knowledge';
import { FusionEngine } from '../fusion/FusionEngine';
import { PimQuery } from '../queries';
import { buildTopology } from '../pim/TopologyGraph';
import type { EntitySpec, RelationSpec } from './helpers';
import { populate } from './helpers';

/** Build a wide project: N services, each described by code + infra + docs, in a chain. */
function bigProject(n: number): { entities: EntitySpec[]; relations: RelationSpec[] } {
  const entities: EntitySpec[] = [];
  const relations: RelationSpec[] = [];
  for (let i = 0; i < n; i++) {
    entities.push({ name: `Service${i}`, kind: 'service', origin: 'code' });
    entities.push({ name: `service-${i}`, kind: 'container', origin: 'infrastructure' });
    entities.push({ name: `Service ${i}`, kind: 'service', origin: 'document' });
    if (i > 0) relations.push({ from: `Service${i}`, to: `Service${i - 1}`, kind: 'dependsOn', origin: 'code' });
  }
  return { entities, relations };
}

describe('large repositories', () => {
  it('fuses thousands of cross-source entities quickly and correctly', () => {
    const n = 800;
    const { entities, relations } = bigProject(n);
    const pkm = new ProjectKnowledgeModel();
    populate(pkm, entities, relations);

    const start = Date.now();
    const pim = new FusionEngine().fuse(pkm, 1);
    const elapsed = Date.now() - start;

    // Each service's 3 surface forms fuse to one entity.
    expect(pim.byKind('service').length).toBe(n);
    const s0 = pim.findByName('Service0')!;
    expect([...s0.sourceKinds].sort()).toEqual(['code', 'document', 'infrastructure']);
    expect(elapsed).toBeLessThan(4000);
  });

  it('answers transitive impact over a long dependency chain', () => {
    const { entities, relations } = bigProject(200);
    const pkm = new ProjectKnowledgeModel();
    populate(pkm, entities, relations);
    const pim = new FusionEngine().fuse(pkm, 1);
    const q = new PimQuery(pim);
    // Service0 is depended on (directly or transitively) by every other service.
    expect(q.downstreamImpact('Service0').length).toBe(199);
    expect(buildTopology(pim, 'dependency').edges.length).toBe(199);
  });
});
