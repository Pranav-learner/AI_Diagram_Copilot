/**
 * Diagram Intelligence Engine — public API barrel (re-exported from `@/ai`).
 *
 * Phase 4, Module 4. The proactive reasoning layer: it continuously observes the
 * diagram, runs deterministic static analysis, stores findings in a stateful
 * repository with lifecycle + history, aggregates and ranks them into a proactive
 * **insight feed**, and lazily uses the LLM to narrate a briefing. Discovery,
 * scoring, and ranking are deterministic; the LLM only reasons and recommends.
 *
 * This engine is designed to be the central reasoning layer future enterprise
 * features (Smart Import, Reverse Engineering, Architecture Intelligence) reuse.
 * See `src/ai/intelligence/README.md`.
 */

// ── Model ─────────────────────────────────────────────────────────────────────
export * from './model/Insight';
export * from './model/Timeline';
export * from './model/Briefing';

// ── Stateful stores ───────────────────────────────────────────────────────────
export * from './FindingRepository';
export * from './IntelligenceTimeline';

// ── Deterministic pipeline (aggregate → prioritize) ──────────────────────────
export * from './aggregation';
export * from './prioritization';

// ── Planning, formatting, orchestration ──────────────────────────────────────
export * from './InsightPlanner';
export * from './InsightFormatter';
export * from './IntelligenceEngine';
export * from './errors';

// ── Prompts + mock provider ──────────────────────────────────────────────────
export * from './prompts/insightPrompts';
export * from './MockInsightProvider';
