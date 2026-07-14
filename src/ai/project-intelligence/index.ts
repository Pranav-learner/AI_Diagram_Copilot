/**
 * Project Intelligence Engine — public API barrel (re-exported from `@/ai`).
 *
 * Phase 5, Module 3. The **fusion** layer of the AI stack: it merges the knowledge the
 * upstream engines extracted (documents, source code, infrastructure, OpenAPI/GraphQL,
 * databases, and existing diagrams — all via the shared Project Knowledge Model) into a
 * single **Project Intelligence Model (PIM)**, a renderer-independent "digital twin" of
 * the whole project. One entity per real-world concept, with unified multi-source
 * evidence, cross-source topology, detected conflicts, and inferred architecture.
 *
 * Every future capability — Import Copilot, Repository Copilot, AI Documentation,
 * Multi-Agent reasoning, Enterprise Architecture Intelligence — reasons over the PIM
 * through {@link ProjectIntelligenceEngine}. Never expose raw repositories, parsers, or
 * the PKM to a consumer.
 *
 * See `src/ai/project-intelligence/README.md` for the full architecture. Deterministic:
 * no LLM anywhere in this module.
 */

// ── The model (the digital twin) ───────────────────────────────────────────────
export { ProjectIntelligenceModel } from './pim/ProjectIntelligenceModel';
export type {
  Evidence,
  ExtractionMethod,
  SourceKind,
  PimEntity,
  PimEntityKind,
  PimRelation,
  PimRelationKind,
  Conflict,
  ConflictKind,
  ConflictSeverity,
  PimStats,
} from './pim/ProjectIntelligenceModel';

// ── Topology projections ────────────────────────────────────────────────────────
export { buildTopology, TOPOLOGY_DIMENSIONS } from './pim/TopologyGraph';
export type { TopologyDimension, TopologyView } from './pim/TopologyGraph';

// ── Query API (graph traversal over the PIM) ────────────────────────────────────
export { PimQuery } from './queries';
export type { PimDirection } from './queries';

// ── Search ──────────────────────────────────────────────────────────────────────
export { searchPim } from './search';
export type { PimSearchQuery, PimSearchHit, PimSearchType } from './search';

// ── Cross-reference navigation ──────────────────────────────────────────────────
export { crossReferences, buildReverseIndex, entitiesForSource, evidenceOfKind } from './crossref';
export type { CrossReference } from './crossref';

// ── Validation ──────────────────────────────────────────────────────────────────
export { validatePim } from './validation';
export type { PimValidationReport, PimValidationIssue, PimIssueSeverity } from './validation';

// ── Diagram source adapter (ingest existing diagrams into the shared PKM) ────────
export { semanticGraphToExtraction, diagramDocumentId } from './sources/DiagramSource';
export type { DiagramSourceInput } from './sources/DiagramSource';

// ── Fusion internals (exported for advanced / testing use). `resolveEntities` and
//    `detectConflicts` are aliased to avoid clashing with the PKM / diagram-editing
//    functions of the same name already re-exported from `@/ai`. ──────────────────
export { FusionEngine } from './fusion/FusionEngine';
export { resolveEntities as resolvePimEntities } from './fusion/EntityResolver';
export type { EntityCluster, ResolutionResult } from './fusion/EntityResolver';
export { detectConflicts as detectPimConflicts } from './fusion/ConflictResolver';

// ── The engine (the single front door) ──────────────────────────────────────────
export { ProjectIntelligenceEngine } from './ProjectIntelligenceEngine';
export type { ProjectIntelligenceEngineDeps, PimUpdateListener } from './ProjectIntelligenceEngine';

// ── Mock Project Intelligence Provider ──────────────────────────────────────────
export { MockProjectIntelligenceProvider } from './MockProjectIntelligenceProvider';

