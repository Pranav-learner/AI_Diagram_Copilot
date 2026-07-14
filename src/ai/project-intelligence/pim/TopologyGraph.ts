/**
 * TopologyGraph — semantic project views over the PIM.
 *
 * Each dimension (dependency, service, infrastructure, ownership, capability,
 * requirement, workflow) is a filtered projection of the fused entities + relations,
 * so a consumer can ask for "the service graph" or "the ownership graph" directly.
 * Pure and deterministic; derived from a PIM snapshot.
 */

import type { PimEntity, PimRelation, ProjectIntelligenceModel } from './ProjectIntelligenceModel';

export type TopologyDimension = 'dependency' | 'service' | 'infrastructure' | 'ownership' | 'capability' | 'requirement' | 'workflow';

export interface TopologyView {
  readonly dimension: TopologyDimension;
  readonly nodes: readonly PimEntity[];
  readonly edges: readonly PimRelation[];
}

interface Spec {
  readonly entityKinds?: ReadonlySet<string>;
  readonly relationKinds: ReadonlySet<string>;
}

const SPECS: Readonly<Record<TopologyDimension, Spec>> = {
  dependency: { relationKinds: new Set(['dependsOn', 'calls', 'references']) },
  service: { entityKinds: new Set(['service', 'module', 'component', 'api', 'endpoint', 'capability']), relationKinds: new Set(['dependsOn', 'calls', 'connectsTo', 'exposes']) },
  infrastructure: { entityKinds: new Set(['service', 'container', 'deployment', 'resource', 'queue', 'cache', 'database', 'ingress', 'volume', 'secret']), relationKinds: new Set(['connectsTo', 'deployedAs', 'dependsOn', 'contains']) },
  ownership: { relationKinds: new Set(['owns']) },
  capability: { entityKinds: new Set(['capability', 'service', 'domain']), relationKinds: new Set(['implements', 'exposes', 'partOf']) },
  requirement: { entityKinds: new Set(['requirement', 'service', 'component', 'goal']), relationKinds: new Set(['implements', 'references', 'relatedTo']) },
  workflow: { entityKinds: new Set(['workflow', 'process', 'actor']), relationKinds: new Set(['relatedTo', 'connectsTo', 'calls']) },
};

/** Build one topology view from a PIM snapshot. */
export function buildTopology(pim: ProjectIntelligenceModel, dimension: TopologyDimension): TopologyView {
  const spec = SPECS[dimension];
  const nodeIds = new Set<string>();
  const edges: PimRelation[] = [];

  for (const r of pim.relations()) {
    if (!spec.relationKinds.has(r.kind)) continue;
    const s = pim.getEntity(r.source);
    const t = pim.getEntity(r.target);
    if (!s || !t) continue;
    if (spec.entityKinds && !(spec.entityKinds.has(s.kind) || spec.entityKinds.has(t.kind))) continue;
    edges.push(r);
    nodeIds.add(r.source);
    nodeIds.add(r.target);
  }
  // Include isolated entities of the dimension's kinds (e.g. a service with no edges).
  if (spec.entityKinds) for (const e of pim.entities()) if (spec.entityKinds.has(e.kind)) nodeIds.add(e.id);

  const nodes = [...nodeIds].map((id) => pim.getEntity(id)!).filter(Boolean);
  return { dimension, nodes, edges };
}

/** All topology dimensions (for callers that want the full set). */
export const TOPOLOGY_DIMENSIONS = Object.keys(SPECS) as TopologyDimension[];
