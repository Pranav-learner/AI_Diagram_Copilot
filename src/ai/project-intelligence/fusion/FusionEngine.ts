/**
 * FusionEngine — merges the PKM into the Project Intelligence Model.
 *
 *   PKM (facts per source) → resolve entities → merge evidence → fuse relations →
 *   enrich (inferred layers/domains/capabilities) → detect conflicts → PIM
 *
 * This is where "the same concept in multiple sources" becomes one intelligent,
 * evidence-backed, cross-referenced entity. Pure and deterministic — no LLM. The PIM
 * is rebuilt from the (already-cached) PKM, so fusion is cheap relative to extraction.
 */

import type { KnowledgeCategory, ProjectKnowledgeModel } from '../../knowledge';
import { OntologyMapper } from '../../knowledge/ontology/OntologyMapper';
import { ProjectIntelligenceModel, type Evidence, type PimEntity, type PimEntityKind, type PimRelation, type PimRelationKind } from '../pim/ProjectIntelligenceModel';
import { resolveEntities, type EntityCluster } from './EntityResolver';
import { mergeEvidence, relationEvidence, inferenceEvidence } from './EvidenceMerger';
import { enrich } from '../enrichment';
import { detectConflicts } from './ConflictResolver';
import { extractVersion } from '../util';

/** PKM entity kind → PIM entity kind. Mostly pass-through; a few are elevated. */
function pimKind(kind: string): PimEntityKind {
  if (kind === 'system') return 'subsystem';
  if (kind === 'process') return 'workflow';
  return kind as PimEntityKind;
}

/** PKM relation kind → PIM relation kind. */
const REL_MAP: Readonly<Record<string, PimRelationKind>> = {
  dependsOn: 'dependsOn',
  uses: 'dependsOn',
  calls: 'calls',
  contains: 'contains',
  composedOf: 'contains',
  partOf: 'partOf',
  produces: 'exposes',
  consumes: 'references',
  references: 'references',
  implements: 'implements',
  extends: 'references',
  connectsTo: 'connectsTo',
  owns: 'owns',
  triggers: 'relatedTo',
  flowsTo: 'relatedTo',
  sends: 'relatedTo',
};

export class FusionEngine {
  /** Build the PIM from the current PKM state. */
  fuse(pkm: ProjectKnowledgeModel, version: number): ProjectIntelligenceModel {
    const { clusters, pkmToCluster, crossRefs } = resolveEntities(pkm.entities());
    const baseEntities = clusters.map((c) => buildEntity(c));

    // ── Fuse relations (rewriting endpoints to PIM cluster ids, deduping) ────────
    const relations = new Map<string, { rel: PimRelation; evidence: Evidence[]; keys: Set<string> }>();
    const emit = (source: string, kind: PimRelationKind, target: string, confidence: number, evidence: Evidence[]) => {
      if (source === target) return;
      const id = `${source}|${kind}|${target}`;
      const existing = relations.get(id);
      if (existing) {
        existing.rel = { ...existing.rel, confidence: Math.max(existing.rel.confidence, confidence) };
        for (const e of evidence) {
          const k = `${e.origin}:${e.source}:${e.location ?? ''}`;
          if (!existing.keys.has(k)) {
            existing.keys.add(k);
            existing.evidence.push(e);
          }
        }
      } else {
        relations.set(id, { rel: { id, source, target, kind, confidence, evidence: [] }, evidence: [...evidence], keys: new Set(evidence.map((e) => `${e.origin}:${e.source}:${e.location ?? ''}`)) });
      }
    };

    for (const r of pkm.relations()) {
      const s = pkmToCluster.get(r.source);
      const t = pkmToCluster.get(r.target);
      if (!s || !t) continue;
      emit(s, REL_MAP[r.kind] ?? 'relatedTo', t, r.confidence, r.sources.map((ref) => relationEvidence(ref, r.confidence)));
    }
    // Partial-match cross-references (documented duplicates linked, not merged).
    for (const { a, b } of crossRefs) emit(a, 'relatedTo', b, 0.5, [inferenceEvidence('entity-resolution', 0.5)]);

    const baseRelations = [...relations.values()].map((r) => ({ ...r.rel, evidence: r.evidence }));

    // ── Enrichment + conflicts ────────────────────────────────────────────────
    const enriched = enrich(baseEntities, baseRelations);
    const allRelations = [...baseRelations, ...enriched.relations];
    const conflicts = detectConflicts(enriched.entities, allRelations);

    return new ProjectIntelligenceModel({ entities: enriched.entities, relations: allRelations, conflicts, pkmToPim: pkmToCluster, version });
  }
}

function buildEntity(cluster: EntityCluster): PimEntity {
  const members = cluster.members;
  const { evidence, sourceKinds } = mergeEvidence(members);

  const aliases = new Set<string>();
  const tags = new Set<string>();
  const attributes: Record<string, string | number | boolean> = {};
  const versionSet = new Set<string>();
  let description: string | undefined;
  let maxConfidence = 0;
  const catCount = new Map<KnowledgeCategory, number>();

  for (const m of [...members].sort((a, b) => a.confidence - b.confidence)) {
    if (m.name.toLowerCase() !== cluster.canonicalName.toLowerCase()) aliases.add(m.name);
    for (const a of m.aliases) aliases.add(a);
    for (const t of m.tags) tags.add(t);
    Object.assign(attributes, m.attributes); // higher-confidence members last → win
    if (m.description && (!description || m.description.length > description.length)) description = m.description;
    maxConfidence = Math.max(maxConfidence, m.confidence);
    if (m.category && m.category !== 'general') catCount.set(m.category, (catCount.get(m.category) ?? 0) + 1);
    const v = extractVersion(m.name, m.attributes);
    if (v) versionSet.add(v);
  }

  const category = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general';
  // Multi-source corroboration boosts confidence.
  const confidence = Math.min(0.99, maxConfidence + 0.05 * Math.max(0, sourceKinds.length - 1));

  return {
    id: cluster.id,
    name: cluster.canonicalName,
    kind: pimKind(cluster.kind),
    ontologyType: OntologyMapper.mapKind(pimKind(cluster.kind)),
    category,
    aliases: [...aliases],
    tags: [...tags],
    ...(description ? { description } : {}),
    confidence,
    evidence,
    sourceKinds,
    attributes,
    ...(versionSet.size ? { versions: [...versionSet] } : {}),
    pkmIds: members.map((m) => m.id),
  };
}
