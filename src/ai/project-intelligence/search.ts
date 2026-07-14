/**
 * Search over the PIM — entity, capability, service, requirement, API, infrastructure,
 * and diagram search.
 *
 * Deterministic ranking over names/aliases + kind/source filters. Future semantic
 * retrieval (embeddings) plugs in as an extra ranker without changing this surface.
 */

import type { ProjectIntelligenceModel, SourceKind } from './pim/ProjectIntelligenceModel';

export type PimSearchType = 'keyword' | 'entity' | 'capability' | 'service' | 'requirement' | 'api' | 'infrastructure' | 'diagram';

export interface PimSearchQuery {
  readonly text?: string;
  readonly kind?: string;
  readonly sourceKind?: SourceKind;
  readonly type?: PimSearchType;
  readonly limit?: number;
}

export interface PimSearchHit {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly category: string;
  readonly score: number;
  readonly sourceKinds: readonly SourceKind[];
}

const KIND_SETS: Readonly<Record<string, ReadonlySet<string>>> = {
  service: new Set(['service', 'module', 'component']),
  api: new Set(['api', 'endpoint', 'schema']),
  infrastructure: new Set(['database', 'cache', 'queue', 'container', 'deployment', 'resource', 'ingress']),
  requirement: new Set(['requirement']),
  capability: new Set(['capability']),
};

export function searchPim(pim: ProjectIntelligenceModel, query: PimSearchQuery): PimSearchHit[] {
  const limit = query.limit ?? 25;
  const type = query.type ?? 'keyword';
  const q = query.text?.toLowerCase().trim();
  const kindSet = KIND_SETS[type];
  const requireDiagram = type === 'diagram';

  const hits: PimSearchHit[] = [];
  for (const e of pim.entities()) {
    if (kindSet && !kindSet.has(e.kind)) continue;
    if (query.kind && e.kind !== query.kind) continue;
    if (query.sourceKind && !e.sourceKinds.includes(query.sourceKind)) continue;
    if (requireDiagram && !e.sourceKinds.includes('diagram')) continue;

    const haystack = `${e.name} ${e.aliases.join(' ')}`.toLowerCase();
    if (q && !haystack.includes(q)) continue;
    const exact = q && e.name.toLowerCase() === q ? 3 : 0;
    const prefix = q && e.name.toLowerCase().startsWith(q) ? 1 : 0;
    const multiSource = e.sourceKinds.length > 1 ? 0.5 : 0;
    hits.push({ id: e.id, name: e.name, kind: e.kind, category: e.category, score: exact + prefix + multiSource + e.confidence, sourceKinds: e.sourceKinds });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
