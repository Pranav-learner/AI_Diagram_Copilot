/**
 * Diagram Understanding Engine — public API barrel (re-exported from `@/ai`).
 *
 * Phase 4, Module 1. The compiler front-end of the AI stack: it turns the Diagram
 * DSL ("source code") into a Semantic Graph ("intermediate representation") that
 * every future AI capability — Explain Mode, Diagram Review, AI Insights, Smart
 * Import, multi-agent reasoning — consumes *instead of* the raw DSL.
 *
 * Import everything from here (or `@/ai`); never reach into subpaths. The layer is
 * renderer-, runtime-, and React-independent: it imports `@/dsl` for domain types
 * only and talks to the live diagram through the {@link DiagramChangeSource} port.
 *
 * See `src/ai/understanding/README.md` for the full architecture.
 */

// ── Semantic model (the IR) ──────────────────────────────────────────────────
export * from './model/entity';
export * from './model/relationship';
export * from './model/group';
export * from './model/graph';

// ── Build: classification, indexing, full + incremental compilation ──────────
export * from './build/classify';
export * from './build/SemanticGraphBuilder';
export * from './build/incremental';
export { normLabel } from './build/GraphIndex';

// ── Graph analysis utilities ─────────────────────────────────────────────────
export * from './analysis/traversal';
export * from './analysis/paths';
export * from './analysis/components';
export * from './analysis/hierarchy';
export * from './analysis/search';

// ── Context extraction ────────────────────────────────────────────────────────
export * from './context/ContextExtractor';

// ── Semantic summaries ────────────────────────────────────────────────────────
export * from './summary/summaries';

// ── Query API (the surface future AI modules use) ────────────────────────────
export * from './query/SemanticQuery';

// ── Validation ────────────────────────────────────────────────────────────────
export * from './validation/validateGraph';

// ── Caching ───────────────────────────────────────────────────────────────────
export * from './cache/RegionCache';

// ── Engine (stateful sync + cache orchestration) ─────────────────────────────
export * from './engine/ports';
export * from './engine/UnderstandingEngine';
