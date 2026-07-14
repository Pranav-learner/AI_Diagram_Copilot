/**
 * Test helpers — construct a shared PKM populated from multiple source kinds, and fuse
 * it into a PIM. Mirrors how the real engines (documents / reverse-engineering /
 * diagrams) write into one PKM, so the fusion tests exercise the real merge paths.
 */

import { ProjectKnowledgeModel } from '../../knowledge';
import type { ExtractedEntity, ExtractedRelation, ExtractionResult } from '../../knowledge/extractors/types';
import { FusionEngine } from '../fusion/FusionEngine';
import { ProjectIntelligenceModel } from '../pim/ProjectIntelligenceModel';

export type Origin = 'document' | 'code' | 'infrastructure' | 'api' | 'database' | 'diagram';

/** Attributes + a document id that make the evidence classifier tag `origin`. */
const ORIGIN_SETUP: Record<Origin, { attrs: Record<string, string>; docId: string }> = {
  document: { attrs: {}, docId: 'doc-arch' },
  code: { attrs: { origin: 'code', language: 'typescript' }, docId: 'src/index.ts' },
  infrastructure: { attrs: { origin: 'code', language: 'docker-compose' }, docId: 'docker-compose.yml' },
  api: { attrs: { origin: 'code', language: 'openapi' }, docId: 'openapi.yaml' },
  database: { attrs: { origin: 'code', language: 'sql' }, docId: 'schema.sql' },
  diagram: { attrs: { origin: 'diagram' }, docId: 'diagram:main' },
};

export interface EntitySpec {
  readonly name: string;
  readonly kind: string;
  readonly origin: Origin;
  readonly confidence?: number;
  readonly aliases?: readonly string[];
  readonly tags?: readonly string[];
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface RelationSpec {
  readonly from: string;
  readonly to: string;
  readonly kind: string;
  readonly origin?: Origin;
}

function toExtracted(spec: EntitySpec): { docId: string; entity: ExtractedEntity } {
  const setup = ORIGIN_SETUP[spec.origin];
  return {
    docId: setup.docId,
    entity: {
      name: spec.name,
      kind: spec.kind,
      confidence: spec.confidence ?? 0.7,
      ...(spec.aliases ? { aliases: spec.aliases } : {}),
      ...(spec.tags ? { tags: spec.tags } : {}),
      evidence: { documentId: setup.docId, nodeId: `${spec.origin}:${spec.name}`, excerpt: spec.name },
      attributes: { ...setup.attrs, ...spec.attributes },
    },
  };
}

/** Ingest entities + relations grouped by their source document into the PKM. */
export function populate(pkm: ProjectKnowledgeModel, entities: readonly EntitySpec[], relations: readonly RelationSpec[] = []): void {
  const byDoc = new Map<string, { entities: ExtractedEntity[]; relations: ExtractedRelation[] }>();
  const bucket = (docId: string) => {
    let b = byDoc.get(docId);
    if (!b) byDoc.set(docId, (b = { entities: [], relations: [] }));
    return b;
  };

  for (const spec of entities) {
    const { docId, entity } = toExtracted(spec);
    bucket(docId).entities.push(entity);
  }
  for (const r of relations) {
    const origin = r.origin ?? 'document';
    const setup = ORIGIN_SETUP[origin];
    bucket(setup.docId).relations.push({
      sourceName: r.from,
      targetName: r.to,
      kind: r.kind,
      confidence: 0.7,
      evidence: { documentId: setup.docId, nodeId: `rel:${r.from}:${r.to}`, excerpt: `${r.from} ${r.kind} ${r.to}` },
      sentence: `${r.from} ${r.kind} ${r.to}`,
    });
  }

  let version = 1;
  for (const [docId, result] of byDoc) {
    const extraction: ExtractionResult = result;
    pkm.ingest({ id: docId, title: docId, docType: docId.startsWith('doc-') ? 'markdown' : 'source', contentHash: `${docId}-${version}`, version }, extraction);
    version++;
  }
}

/** Build a PKM, populate it, and fuse it into a PIM. */
export function fuse(entities: readonly EntitySpec[], relations: readonly RelationSpec[] = []): ProjectIntelligenceModel {
  const pkm = new ProjectKnowledgeModel();
  populate(pkm, entities, relations);
  return new FusionEngine().fuse(pkm, 1);
}
