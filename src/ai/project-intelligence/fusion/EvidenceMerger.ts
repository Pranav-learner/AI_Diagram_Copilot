/**
 * EvidenceMerger — the evidence model of the PIM.
 *
 * Converts each PKM {@link EvidenceRef} into a typed {@link Evidence} that records
 * its **origin, source, location, confidence, and extraction method**, classifying
 * the source kind (document / code / infrastructure / api / database / diagram) from
 * the entity's attributes + document id. When a concept is fused from many PKM
 * entities, all their evidence is merged (deduplicated) so the PIM entity remains
 * fully traceable to every artifact that described it.
 */

import type { EvidenceRef, KnowledgeEntity } from '../../knowledge';
import type { Evidence, ExtractionMethod, SourceKind } from '../pim/ProjectIntelligenceModel';

const CODE_LANGS = new Set(['typescript', 'javascript', 'python', 'go', 'java']);
const INFRA_LANGS = new Set(['docker-compose', 'kubernetes', 'terraform', 'dockerfile']);
const API_LANGS = new Set(['openapi', 'graphql', 'json-schema']);

/** Classify which artifact kind a PKM entity's evidence came from. */
export function sourceKindOf(entity: KnowledgeEntity, ref: EvidenceRef): SourceKind {
  const origin = String(entity.attributes.origin ?? '');
  const language = String(entity.attributes.language ?? '');
  if (origin === 'diagram' || ref.documentId.startsWith('diagram:')) return 'diagram';
  if (INFRA_LANGS.has(language)) return 'infrastructure';
  if (language === 'sql') return 'database';
  if (API_LANGS.has(language)) return 'api';
  if (origin === 'code' || CODE_LANGS.has(language)) return 'code';
  // Document-derived (Module 1) or architecture-level.
  if (ref.documentId === '__repository__') return 'code';
  if (/\.sql$/i.test(ref.documentId)) return 'database';
  if (/dockerfile|compose|\.tf$|\.ya?ml$/i.test(ref.documentId)) return 'infrastructure';
  return 'document';
}

/** Classify a source kind from a document/file id alone (for relation evidence). */
export function sourceKindOfDocument(documentId: string): SourceKind {
  if (documentId.startsWith('diagram:')) return 'diagram';
  if (documentId.startsWith('doc-')) return 'document';
  if (documentId === '__repository__') return 'code';
  if (/\.sql$/i.test(documentId)) return 'database';
  if (/\.(graphql|gql)$/i.test(documentId) || /openapi|swagger/i.test(documentId)) return 'api';
  if (/dockerfile|compose|\.tf$|\.tfvars$|\.ya?ml$/i.test(documentId)) return 'infrastructure';
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|java)$/i.test(documentId)) return 'code';
  return 'document';
}

export function relationEvidence(ref: EvidenceRef, confidence: number): Evidence {
  const origin = sourceKindOfDocument(ref.documentId);
  return { origin, source: ref.documentId, confidence, method: methodOf(origin), ...(ref.excerpt ? { excerpt: ref.excerpt } : {}) };
}

export function methodOf(kind: SourceKind): ExtractionMethod {
  switch (kind) {
    case 'code':
      return 'static-analysis';
    case 'infrastructure':
      return 'infrastructure';
    case 'database':
    case 'api':
      return 'schema';
    case 'diagram':
      return 'diagram';
    case 'inference':
      return 'inference';
    default:
      return 'documentation';
  }
}

export function toEvidence(entity: KnowledgeEntity, ref: EvidenceRef): Evidence {
  const origin = sourceKindOf(entity, ref);
  const location = ref.line !== undefined ? `L${ref.line}` : ref.sectionId;
  return { origin, source: ref.documentId, ...(location ? { location } : {}), confidence: entity.confidence, method: methodOf(origin), ...(ref.excerpt ? { excerpt: ref.excerpt } : {}) };
}

export interface MergedEvidence {
  readonly evidence: readonly Evidence[];
  readonly sourceKinds: readonly SourceKind[];
}

/** Merge (and deduplicate) the evidence from every member of a cluster. */
export function mergeEvidence(members: readonly KnowledgeEntity[]): MergedEvidence {
  const seen = new Set<string>();
  const evidence: Evidence[] = [];
  const sourceKinds = new Set<SourceKind>();
  for (const entity of members) {
    for (const ref of entity.sources) {
      const ev = toEvidence(entity, ref);
      const key = `${ev.origin}:${ev.source}:${ev.location ?? ''}`;
      sourceKinds.add(ev.origin);
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push(ev);
      }
    }
  }
  return { evidence, sourceKinds: [...sourceKinds] };
}

/** A single synthesised evidence record (for inferred / relation evidence). */
export function inferenceEvidence(source: string, confidence = 0.6): Evidence {
  return { origin: 'inference', source, confidence, method: 'inference' };
}
