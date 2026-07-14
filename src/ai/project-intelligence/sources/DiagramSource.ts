/**
 * Diagram source adapter — ingests existing diagrams into the shared PKM.
 *
 * The PIM fuses knowledge from documents, code, infrastructure, APIs, databases **and
 * existing diagrams**. Documents/code already flow into the PKM via their own engines;
 * this adapter closes the loop for diagrams by projecting a {@link SemanticGraph} (the
 * Diagram Understanding IR) onto the PKM's {@link ExtractionResult} contract, tagged
 * with `origin: 'diagram'` so the fusion layer classifies its evidence as diagram-sourced.
 *
 * Deterministic and renderer-independent — it reads the semantic graph, never the DSL
 * or renderer.
 */

import type { SemanticGraph } from '../../understanding';
import type { EvidenceRef } from '../../knowledge';
import type { EntityKind } from '../../knowledge/pkm/KnowledgeEntity';
import type { ExtractedEntity, ExtractedRelation, ExtractionResult } from '../../knowledge/extractors/types';

/** Map a diagram-side (understanding) entity kind onto a PKM entity kind. */
const KIND_MAP: Readonly<Record<string, EntityKind>> = {
  service: 'service',
  api: 'api',
  gateway: 'component',
  database: 'database',
  cache: 'component',
  queue: 'component',
  server: 'service',
  storage: 'database',
  loadBalancer: 'component',
  function: 'service',
  component: 'component',
  externalSystem: 'system',
  user: 'actor',
  actor: 'actor',
  process: 'process',
  task: 'process',
  entity: 'concept',
  class: 'component',
  interface: 'api',
};

function mapKind(kind: string): EntityKind {
  return KIND_MAP[kind] ?? 'concept';
}

/** Map a diagram relationship kind onto a PKM relation kind. */
const REL_MAP: Readonly<Record<string, string>> = {
  dependsOn: 'dependsOn',
  calls: 'calls',
  uses: 'uses',
  contains: 'contains',
  connectsTo: 'dependsOn',
  flowsTo: 'dependsOn',
  references: 'references',
  extends: 'partOf',
  implements: 'implements',
  triggers: 'triggers',
};

/**
 * Project a diagram's {@link SemanticGraph} onto an {@link ExtractionResult} for PKM
 * ingest. `documentId` becomes the evidence `documentId` (the fusion layer keys
 * diagram sources off ids beginning with `diagram:` — see {@link DiagramSource}'s
 * default id below and the evidence classifier).
 */
export function semanticGraphToExtraction(graph: SemanticGraph, documentId: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const idToName = new Map<string, string>();

  for (const e of graph.entities.values()) {
    const name = e.label.trim();
    if (!name) continue;
    idToName.set(e.id, name);
    const evidence: EvidenceRef = { documentId, nodeId: e.id, excerpt: e.description?.trim() || name };
    entities.push({
      name,
      kind: mapKind(e.kind),
      confidence: e.inferred ? 0.55 : 0.75,
      ...(e.tags.length ? { tags: e.tags } : {}),
      ...(e.description ? { description: e.description } : {}),
      evidence,
      attributes: { origin: 'diagram', semanticKind: e.kind },
    });
  }

  const relations: ExtractedRelation[] = [];
  for (const r of graph.relationships.values()) {
    const sourceName = idToName.get(r.source);
    const targetName = idToName.get(r.target);
    if (!sourceName || !targetName) continue;
    const evidence: EvidenceRef = { documentId, nodeId: r.id, excerpt: r.label?.trim() || `${sourceName} → ${targetName}` };
    relations.push({
      sourceName,
      targetName,
      kind: REL_MAP[r.kind] ?? 'relatedTo',
      confidence: r.inferred ? 0.5 : 0.7,
      evidence,
      sentence: r.label?.trim() || `${sourceName} → ${targetName}`,
    });
  }

  return { entities, relations };
}

/** A diagram registered as a knowledge source: a stable id + its semantic graph. */
export interface DiagramSourceInput {
  /** Stable identifier for the diagram (defaults to `diagram:<id>` if it lacks a prefix). */
  readonly id: string;
  readonly title?: string;
  readonly graph: SemanticGraph;
}

/** Normalise a diagram id so the fusion layer classifies it as diagram-sourced. */
export function diagramDocumentId(id: string): string {
  return id.startsWith('diagram:') ? id : `diagram:${id}`;
}
