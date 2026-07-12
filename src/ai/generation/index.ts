/**
 * AI Diagram Generation — public barrel (re-exported from `@/ai`).
 *
 * The first AI capability. Everything flows through the safe pipeline:
 *   prompt → DiagramPlan (LLM, semantic only) → validation → ExecutionPlanner
 *   (+ LayoutEngine) → OperationPlan → DiagramGateway → DiagramRuntime.
 * The LLM never emits coordinates, operations, or DSL — only a semantic plan.
 */

// Model: the strongly-typed plan + the diagram-type registry.
export * from './model/DiagramType';
export * from './model/DiagramPlan';

// Layout: app-side positioning.
export * from './layout';

// Validation, styling, execution planning.
export * from './validation/validatePlan';
export * from './styling';
export * from './ExecutionPlanner';

// Prompts (centralized + versioned).
export * from './prompts/generationPrompts';

// Providers, orchestration, and pipeline integration.
export * from './MockPlanProvider';
export * from './errors';
export * from './DiagramGenerator';
export * from './GenerationHandler';
