/**
 * RepositoryMerger — projects the Code Knowledge Graph into the Project Knowledge
 * Model, unifying documents and code in one knowledge representation.
 *
 * Only architecture-significant entities (modules, services, classes, endpoints,
 * tables, infra, libraries, bounded contexts, …) are merged — not every local
 * variable — so the PKM stays meaningful. Each entity retains its **source, file,
 * line, language, evidence, and confidence** (the spec's provenance requirements),
 * grouped by originating file so the engine can update the PKM incrementally.
 */

import type { ExtractedEntity, ExtractedRelation, ExtractionResult } from '../../knowledge';
import type { CodeEntity, CodeKnowledgeGraph, CodeRelationKind } from '../graph/CodeKnowledgeGraph';

/** CKG kind → PKM entity kind. Absent kinds are *not* merged (too granular). */
const KIND_MAP: Readonly<Record<string, string>> = {
  module: 'component',
  service: 'service',
  class: 'component',
  struct: 'component',
  interface: 'concept',
  endpoint: 'api',
  operation: 'api',
  table: 'database',
  view: 'database',
  database: 'database',
  cache: 'cache',
  queue: 'queue',
  resource: 'resource',
  deployment: 'service',
  container: 'service',
  ingress: 'component',
  library: 'component',
  boundedContext: 'system',
  layer: 'concept',
  schema: 'concept',
};

const REL_MAP: Readonly<Record<string, string>> = {
  dependsOn: 'dependsOn',
  imports: 'dependsOn',
  calls: 'calls',
  extends: 'extends',
  implements: 'implements',
  contains: 'contains',
  partOf: 'partOf',
  exposes: 'produces',
  routes: 'triggers',
  connectsTo: 'connectsTo',
  deploys: 'owns',
  composedOf: 'composedOf',
  references: 'references',
  readsFrom: 'consumes',
  writesTo: 'produces',
  owns: 'owns',
};

const REPO_DOC = '__repository__';

/** Scalar attributes worth surfacing on the PKM entity. */
const SCALAR_META = ['method', 'path', 'operationId', 'image', 'baseImage', 'resourceType', 'provider', 'k8sKind', 'serviceType', 'external', 'shared', 'integrationPoint', 'isService', 'type'];

/** Group the merge-worthy graph into per-document (per-file) extraction slices. */
export function buildRepositorySlices(graph: CodeKnowledgeGraph): Map<string, ExtractionResult> {
  const significant = new Map<string, { entity: CodeEntity; kind: string }>();
  for (const e of graph.entities()) {
    const kind = KIND_MAP[e.kind];
    if (kind) significant.set(e.id, { entity: e, kind });
  }

  const slices = new Map<string, { entities: ExtractedEntity[]; relations: ExtractedRelation[] }>();
  const slice = (doc: string) => {
    let s = slices.get(doc);
    if (!s) slices.set(doc, (s = { entities: [], relations: [] }));
    return s;
  };

  for (const { entity, kind } of significant.values()) {
    const doc = entity.file ?? REPO_DOC;
    slice(doc).entities.push({
      name: entity.name,
      kind,
      confidence: entity.confidence,
      tags: entity.language ? [entity.language, entity.kind] : [entity.kind],
      evidence: { documentId: doc, nodeId: entity.id, excerpt: `${entity.kind} ${entity.qualifiedName ?? entity.name}`.slice(0, 180), ...(entity.source?.startLine ? { line: entity.source.startLine } : {}) },
      attributes: scalarAttrs(entity),
    });
  }

  for (const r of graph.relations()) {
    const s = significant.get(r.source);
    const t = significant.get(r.target);
    if (!s || !t) continue;
    const doc = r.file ?? s.entity.file ?? REPO_DOC;
    slice(doc).relations.push({
      sourceName: s.entity.name,
      sourceKind: s.kind,
      targetName: t.entity.name,
      targetKind: t.kind,
      kind: (REL_MAP[r.kind] ?? 'relatedTo') as CodeRelationKind,
      confidence: 0.8,
      evidence: { documentId: doc, nodeId: `${r.source}|${r.kind}|${r.target}`, excerpt: `${s.entity.name} ${r.kind} ${t.entity.name}` },
      sentence: `${s.entity.name} ${r.kind} ${t.entity.name}`,
    });
  }

  return slices;
}

function scalarAttrs(entity: CodeEntity): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = { origin: 'code', codeKind: entity.kind };
  if (entity.language) out.language = entity.language;
  if (entity.file) out.file = entity.file;
  if (entity.qualifiedName) out.qualifiedName = entity.qualifiedName;
  if (entity.source) out.line = entity.source.startLine;
  for (const key of SCALAR_META) {
    const v = entity.metadata[key];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[key] = v;
  }
  return out;
}
