/**
 * Explain Mode — public API barrel (re-exported from `@/ai`).
 *
 * Phase 4, Module 2. An intelligent, contextual explanation system that lets a
 * user click any node, relationship, group, path, or selection and receive a
 * mentor-grade explanation adapted to audience, style, depth, and the detected
 * domain.
 *
 * Architecture guarantee: Explain Mode consumes ONLY the Semantic Graph + Context
 * View from the Understanding Engine — never the raw Diagram DSL or any renderer
 * detail. Its canonical entry point is the interactive {@link ExplainEngine}
 * (target-based + stateful, with follow-ups), mirroring how editing uses
 * {@link DiagramEditor}. See `src/ai/explain/README.md` for the full design.
 */

// ── Model + schema ────────────────────────────────────────────────────────────
export * from './model/ExplainTypes';
export * from './model/Explanation';

// ── Pipeline stages ───────────────────────────────────────────────────────────
export * from './domain';
export * from './ExplanationPlanner';
export * from './ContextView';
export * from './relatedElements';
export * from './format';

// ── Orchestrator ──────────────────────────────────────────────────────────────
export * from './ExplainEngine';
export * from './errors';

// ── Prompts + mock provider ──────────────────────────────────────────────────
export * from './prompts/explainPrompts';
export * from './MockExplainProvider';
