/**
 * Document Intelligence Engine — public API barrel (re-exported from `@/ai`).
 *
 * Phase 5, Module 1. A deterministic knowledge-ingestion pipeline that converts
 * unstructured documents into a Structured Document Model and a **Project Knowledge
 * Model (PKM)** — the central knowledge representation every future document-facing
 * feature (Diagram Planner, Reverse Engineering, Smart Import, Documentation AI)
 * consumes. No LLM in the discovery path; the DocumentIntelligenceEngine is the only
 * surface consumers touch (never the raw parser).
 *
 * See `src/ai/knowledge/README.md` for the full architecture.
 *
 * A handful of names are exported selectively / aliased to avoid clashing with the
 * diagram-side modules (e.g. `EntityKind`, `search`, `summarize*`, `ValidationReport`).
 */

// ── Structured Document Model ─────────────────────────────────────────────────
export * from './documents/StructuredDocument';
export { parseDocument, parseInline } from './documents/DocumentParser';
export type { DocumentInput } from './documents/DocumentParser';
export { classifyDocument, classifyCategory, KNOWLEDGE_CATEGORIES } from './documents/DocumentClassifier';
export type { KnowledgeCategory } from './documents/DocumentClassifier';
export { DocumentIndexer } from './documents/DocumentIndexer';
export type { Posting, HeadingEntry } from './documents/DocumentIndexer';

// ── Deterministic extractors ──────────────────────────────────────────────────
export * from './extractors';

// ── Project Knowledge Model ────────────────────────────────────────────────────
export type { KnowledgeEntity, EvidenceRef } from './pkm/KnowledgeEntity';
export { entityId, STATEMENT_KINDS, NAMED_KINDS } from './pkm/KnowledgeEntity';
export type { KnowledgeRelation, RelationKind } from './pkm/KnowledgeRelation';
export { relationId } from './pkm/KnowledgeRelation';
export { ProjectKnowledgeModel } from './pkm/ProjectKnowledgeModel';
export type { DocumentRef, PkmStats } from './pkm/ProjectKnowledgeModel';
export { KnowledgeIndex, resolveEntities, resolveRelations } from './pkm/KnowledgeIndex';
export { suggestDuplicates, repeatedEntities } from './pkm/linking';
export type { DuplicateSuggestion } from './pkm/linking';

// ── Summaries (types; compute via the engine) ────────────────────────────────
export type { DocumentSummary, SectionSummary, EntitySummary, RequirementSummary, ArchitectureSummary, Counted } from './summaries/summaries';

// ── Search (types; query via the engine). `SearchHit` aliased to avoid the
//    diagram-side (understanding) `SearchHit`. ──────────────────────────────────
export type { SearchQuery, SearchHit as KnowledgeSearchHit, SearchType, SearchContext } from './search';

// ── Validation (aliased to avoid clashes with diagram-side validation) ────────
export { validateDocument, validatePkm } from './validation';
export type { ValidationReport as DocumentValidationReport, ValidationIssue as DocumentValidationIssue, IssueSeverity as DocumentIssueSeverity } from './validation';

// ── Engine + errors ───────────────────────────────────────────────────────────
export * from './DocumentIntelligenceEngine';
export * from './errors';
