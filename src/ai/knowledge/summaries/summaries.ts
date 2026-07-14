/**
 * Structured summaries — deterministic, renderer-independent digests of documents
 * and the PKM.
 *
 * These are *not* LLM-generated: they are cheap, stable functions of the structured
 * model + knowledge graph that become grounding context for future AI modules
 * (Diagram Planner, Documentation AI). Document, section, requirement, architecture,
 * and entity summaries are all supported.
 */

import type { StructuredDocument } from '../documents/StructuredDocument';
import { isSection, nodeText } from '../documents/StructuredDocument';
import type { KnowledgeEntity } from '../pkm/KnowledgeEntity';
import { NAMED_KINDS } from '../pkm/KnowledgeEntity';
import type { ProjectKnowledgeModel } from '../pkm/ProjectKnowledgeModel';

export interface Counted<T = string> {
  readonly key: T;
  readonly count: number;
}

export interface DocumentSummary {
  readonly documentId: string;
  readonly title: string;
  readonly docType: string;
  readonly sectionCount: number;
  readonly wordCount: number;
  readonly entityCount: number;
  readonly requirementCount: number;
  readonly decisionCount: number;
  readonly riskCount: number;
  readonly topEntities: ReadonlyArray<{ name: string; kind: string; mentions: number }>;
  readonly keyConcepts: readonly string[];
  readonly text: string;
}

export interface SectionSummary {
  readonly sectionId: string;
  readonly heading: string;
  readonly path: readonly string[];
  readonly text: string;
  readonly entities: readonly string[];
}

export interface EntitySummary {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly category: string;
  readonly mentions: number;
  readonly aliases: readonly string[];
  readonly documentCount: number;
  readonly related: ReadonlyArray<{ name: string; kind: string; relation: string }>;
  readonly text: string;
}

export interface RequirementSummary {
  readonly total: number;
  readonly byPriority: readonly Counted[];
  readonly items: ReadonlyArray<{ name: string; priority: string; description: string }>;
  readonly text: string;
}

export interface ArchitectureSummary {
  readonly systems: ReadonlyArray<{ name: string; kind: string }>;
  readonly relations: ReadonlyArray<{ source: string; kind: string; target: string }>;
  readonly text: string;
}

// ── Document ─────────────────────────────────────────────────────────────────

export function summarizeDocument(doc: StructuredDocument, entities: readonly KnowledgeEntity[]): DocumentSummary {
  const named = [...entities].sort((a, b) => b.mentions - a.mentions || b.confidence - a.confidence);
  const topEntities = named.filter((e) => NAMED_KINDS.has(e.kind)).slice(0, 8).map((e) => ({ name: e.name, kind: e.kind, mentions: e.mentions }));
  const requirementCount = entities.filter((e) => e.kind === 'requirement').length;
  const decisionCount = entities.filter((e) => e.kind === 'decision').length;
  const riskCount = entities.filter((e) => e.kind === 'risk').length;
  const keyConcepts = topEntities.slice(0, 5).map((e) => e.name);

  const text =
    `${doc.title} — a ${doc.docType} with ${doc.counts.sections} section(s) and ~${doc.counts.words} words. ` +
    (topEntities.length ? `Key elements: ${keyConcepts.join(', ')}. ` : '') +
    (requirementCount ? `${requirementCount} requirement(s). ` : '') +
    (decisionCount ? `${decisionCount} decision(s). ` : '') +
    (riskCount ? `${riskCount} risk(s).` : '');

  return {
    documentId: doc.id,
    title: doc.title,
    docType: doc.docType,
    sectionCount: doc.counts.sections,
    wordCount: doc.counts.words,
    entityCount: entities.length,
    requirementCount,
    decisionCount,
    riskCount,
    topEntities,
    keyConcepts,
    text: text.trim(),
  };
}

// ── Section ──────────────────────────────────────────────────────────────────

export function summarizeSection(doc: StructuredDocument, sectionId: string, entities: readonly KnowledgeEntity[] = []): SectionSummary | undefined {
  const section = doc.nodes.get(sectionId);
  if (!section || !isSection(section)) return undefined;
  const parts: string[] = [];
  for (const childId of section.childIds) {
    const child = doc.nodes.get(childId);
    if (child && !isSection(child)) parts.push(nodeText(child));
    if (parts.join(' ').length > 400) break;
  }
  const inSection = entities.filter((e) => e.sources.some((s) => s.sectionId === sectionId)).map((e) => e.name);
  return { sectionId, heading: section.heading, path: section.path, text: parts.join(' ').slice(0, 500), entities: [...new Set(inSection)] };
}

// ── Entity ───────────────────────────────────────────────────────────────────

export function summarizeEntity(pkm: ProjectKnowledgeModel, entityId: string): EntitySummary | undefined {
  const e = pkm.getEntity(entityId);
  if (!e) return undefined;
  const related: Array<{ name: string; kind: string; relation: string }> = [];
  for (const r of pkm.relationsOf(entityId).slice(0, 8)) {
    const otherId = r.source === entityId ? r.target : r.source;
    const other = pkm.getEntity(otherId);
    if (other) related.push({ name: other.name, kind: other.kind, relation: r.source === entityId ? r.kind : `${r.kind} (in)` });
  }
  const relClause = related.length ? ` Related to ${related.slice(0, 4).map((r) => r.name).join(', ')}.` : '';
  const text = `${cap(e.kind)} "${e.name}"${e.description ? ` — ${e.description}` : ''} (mentioned ${e.mentions} time(s) across ${e.documentIds.length} document(s)).${relClause}`;
  return { id: e.id, name: e.name, kind: e.kind, category: e.category, mentions: e.mentions, aliases: e.aliases, documentCount: e.documentIds.length, related, text };
}

// ── Requirements ──────────────────────────────────────────────────────────────

export function summarizeRequirements(entities: readonly KnowledgeEntity[]): RequirementSummary {
  const reqs = entities.filter((e) => e.kind === 'requirement');
  const counts = new Map<string, number>();
  const items = reqs.map((e) => {
    const priority = String(e.attributes.priority ?? 'unspecified');
    counts.set(priority, (counts.get(priority) ?? 0) + 1);
    return { name: e.name, priority, description: e.description ?? e.name };
  });
  const byPriority = [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const text = reqs.length === 0 ? 'No requirements found.' : `${reqs.length} requirement(s): ${byPriority.map((p) => `${p.count} ${p.key}`).join(', ')}.`;
  return { total: reqs.length, byPriority, items, text };
}

// ── Architecture ──────────────────────────────────────────────────────────────

export function summarizeArchitecture(pkm: ProjectKnowledgeModel): ArchitectureSummary {
  const systems = pkm.entities().filter((e) => NAMED_KINDS.has(e.kind)).sort((a, b) => b.mentions - a.mentions).slice(0, 20).map((e) => ({ name: e.name, kind: e.kind }));
  const names = new Set(systems.map((s) => s.name));
  const relations = pkm
    .relations()
    .map((r) => ({ source: pkm.getEntity(r.source)?.name ?? '', kind: r.kind, target: pkm.getEntity(r.target)?.name ?? '' }))
    .filter((r) => names.has(r.source) && names.has(r.target))
    .slice(0, 30);
  const text =
    systems.length === 0
      ? 'No architectural elements identified.'
      : `${systems.length} element(s): ${systems.slice(0, 8).map((s) => s.name).join(', ')}. ${relations.length} relationship(s).`;
  return { systems, relations, text };
}

function cap(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
