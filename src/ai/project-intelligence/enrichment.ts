/**
 * Semantic enrichment — the *inferred* knowledge layer of the PIM.
 *
 * Deterministic inference over the fused graph: it promotes architecture markers
 * (layers, bounded contexts) surfaced by the reverse-engineering engine into
 * first-class PIM entities, derives business domains and capabilities, and flags
 * critical components (high fan-in), entry points, exit points, and shared libraries.
 * Every inferred entity/relation carries inference evidence, so the PIM "contains
 * inferred knowledge" while staying traceable. Returns the full, enriched entity set
 * (originals with any added tags, plus inferred entities) and the added relations.
 */

import type { Evidence, PimEntity, PimEntityKind, PimRelation, PimRelationKind } from './pim/ProjectIntelligenceModel';
import { inferenceEvidence } from './fusion/EvidenceMerger';
import { slug } from './util';

const ENTRY_KINDS = new Set(['endpoint', 'api', 'actor']);
const EXIT_KINDS = new Set(['database', 'cache', 'queue', 'library', 'resource']);

export interface EnrichmentResult {
  readonly entities: readonly PimEntity[];
  readonly relations: readonly PimRelation[];
}

export function enrich(entities: readonly PimEntity[], relations: readonly PimRelation[]): EnrichmentResult {
  const all = new Map<string, PimEntity>(entities.map((e) => [e.id, e]));
  const addedRelations: PimRelation[] = [];

  const ensure = (id: string, name: string, kind: PimEntityKind, source: string): void => {
    if (!all.has(id)) {
      all.set(id, { id, name, kind, category: 'architecture', aliases: [], tags: [kind], confidence: 0.6, evidence: [inferenceEvidence(source)], sourceKinds: ['inference'], attributes: { inferred: true }, inferred: true, pkmIds: [] });
    }
  };
  const link = (source: string, kind: PimRelationKind, target: string, evidence: Evidence): void => {
    if (source !== target) addedRelations.push({ id: `${source}|${kind}|${target}`, source, kind, target, confidence: 0.6, evidence: [evidence] });
  };
  const tag = (id: string, t: string): void => {
    const e = all.get(id);
    if (e && !e.tags.includes(t)) all.set(id, { ...e, tags: [...e.tags, t] });
  };

  // Fan-in / fan-out for critical-component + entry/exit detection.
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const r of relations) {
    if (r.kind === 'dependsOn' || r.kind === 'references' || r.kind === 'calls') {
      fanIn.set(r.target, (fanIn.get(r.target) ?? 0) + 1);
      fanOut.set(r.source, (fanOut.get(r.source) ?? 0) + 1);
    }
  }

  const contexts: string[] = [];
  for (const e of entities) {
    if (e.inferred) continue;

    // Promote a reverse-engineered layer marker into a layer entity.
    const attrLayer = typeof e.attributes.layer === 'string' ? e.attributes.layer : '';
    if (attrLayer) {
      const id = `pim:layer:${slug(attrLayer)}`;
      ensure(id, attrLayer, 'layer', e.name);
      link(e.id, 'partOf', id, inferenceEvidence(e.name));
    }
    if (e.kind === 'boundedContext' || e.kind === 'subsystem') contexts.push(e.id);

    // Critical components + shared libraries (high fan-in).
    const inDeg = fanIn.get(e.id) ?? 0;
    if (inDeg >= 3) {
      tag(e.id, 'critical');
      if (e.attributes.shared === true || inDeg >= 5) tag(e.id, 'shared');
    }
    // Entry / exit points.
    if (ENTRY_KINDS.has(e.kind)) tag(e.id, 'entry-point');
    if (EXIT_KINDS.has(e.kind) && (fanOut.get(e.id) ?? 0) === 0) tag(e.id, 'exit-point');
  }

  // Capabilities: one per service that exposes endpoints.
  const exposes = new Map<string, number>();
  for (const r of relations) if (r.kind === 'exposes') exposes.set(r.source, (exposes.get(r.source) ?? 0) + 1);
  for (const [serviceId, count] of exposes) {
    const service = all.get(serviceId);
    if (!service || count === 0) continue;
    const capId = `pim:capability:${slug(service.name)}`;
    ensure(capId, `${service.name} capability`, 'capability', service.name);
    link(serviceId, 'implements', capId, inferenceEvidence(service.name));
  }

  // Business domains from bounded contexts.
  for (const ctxId of contexts) {
    const ctx = all.get(ctxId);
    if (!ctx) continue;
    const domainId = `pim:domain:${slug(ctx.name)}`;
    ensure(domainId, `${ctx.name} domain`, 'domain', ctx.name);
    link(ctxId, 'partOf', domainId, inferenceEvidence(ctx.name));
  }

  return { entities: [...all.values()], relations: addedRelations };
}
