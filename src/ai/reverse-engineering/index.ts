/**
 * Reverse Engineering Engine — public API barrel (re-exported from `@/ai`).
 *
 * Phase 5, Module 2. A deterministic static-analysis platform that turns source
 * repositories + infrastructure manifests into a normalized AST, a Code Knowledge
 * Graph, and PKM entities — the structured representations the LLM reasons over
 * (never raw code). It unifies with the Document Intelligence Engine through a
 * shared PKM.
 *
 *   Repository → ParserRegistry → NormalizedAST → StaticAnalysis → CodeKnowledgeGraph → PKM
 *
 * The {@link ReverseEngineeringEngine} is the only surface consumers touch. See
 * `src/ai/reverse-engineering/README.md` for the full design.
 */

// ── Unified AST ────────────────────────────────────────────────────────────────
export * from './ast/NormalizedAST';
export { ASTBuilder } from './ast/ASTBuilder';
export type { NodeSpec } from './ast/ASTBuilder';

// ── Parsers + registry ──────────────────────────────────────────────────────────
export * from './parsers';

// ── Code Knowledge Graph ────────────────────────────────────────────────────────
export * from './graph/CodeKnowledgeGraph';

// ── Static analysis ──────────────────────────────────────────────────────────────
export * from './analysis';

// ── PKM integration ──────────────────────────────────────────────────────────────
export { buildRepositorySlices } from './pkm/RepositoryMerger';

// ── Search, validation, engine ──────────────────────────────────────────────────
export * from './search';
export * from './validation';
export * from './ReverseEngineeringEngine';
