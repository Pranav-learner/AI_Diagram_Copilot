/**
 * Diagram Review — public API barrel (re-exported from `@/ai`).
 *
 * Phase 4, Module 3. A professional static-analysis platform for diagrams: the
 * **application discovers** issues via a deterministic rule engine over the
 * Semantic Graph and **computes scores**; the **LLM explains** the findings,
 * prioritises them, and recommends fixes. If the model is unavailable the review
 * degrades gracefully to deterministic findings + scores.
 *
 * Pipeline: Semantic Graph → StaticAnalysisEngine (rules → findings) → scoring →
 * ReviewPlanner → LLM → ReviewFormatter → UI. See `src/ai/review/README.md`.
 */

// ── Model ─────────────────────────────────────────────────────────────────────
export * from './model/Finding';
export * from './model/Rule';
export * from './model/Review';

// ── Static analysis + rule engine ────────────────────────────────────────────
export * from './analysis/graphUtils';
export * from './analysis/StaticAnalysisEngine';
export * from './analysis/rules';

// ── Scoring ───────────────────────────────────────────────────────────────────
export * from './scoring/ReviewScorer';

// ── Planning, formatting, orchestration ──────────────────────────────────────
export * from './ReviewPlanner';
export * from './ReviewFormatter';
export * from './ReviewEngine';
export * from './errors';

// ── Prompts + mock provider ──────────────────────────────────────────────────
export * from './prompts/reviewPrompts';
export * from './MockReviewProvider';
