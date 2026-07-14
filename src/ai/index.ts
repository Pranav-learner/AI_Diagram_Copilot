/**
 * The AI Foundation — public API barrel.
 *
 * The single entry point for the AI layer. Import everything from `@/ai`; never
 * reach into subpaths. This layer is independent of React, Excalidraw, the
 * canvas, the rendering engine, and the diagram-engine runtime — it talks to the
 * diagram only through the {@link DiagramContextSource} (read) and
 * {@link DiagramGateway} (write) ports, and imports `@/dsl` for domain *types*
 * only. Future capabilities (generate, edit, explain, review, import, export)
 * are built by registering an {@link IntentHandler}; the rest of the pipeline
 * already exists.
 *
 * See `src/ai/ARCHITECTURE.md` for the full design.
 */

// ── Core: types, config, errors, provider contract, client, service ──────────
export * from './core/types';
export * from './core/tokens';
export * from './core/AIError';
export * from './core/AIConfig';
export * from './core/AIProvider';
export * from './core/AIClient';
export * from './core/ModelRouter';
export * from './core/AIService';
export * from './core/factory';

// ── Providers ────────────────────────────────────────────────────────────────
export * from './providers/http';
export * from './providers/base';
export * from './providers/ProviderRegistry';
export * from './providers/MockProvider';
export * from './providers/AnthropicProvider';
export * from './providers/OpenAIProvider';
export * from './providers/GeminiProvider';
export * from './providers/LocalProvider';

// ── Planning: intent, context, prompt, operation planning ────────────────────
export * from './planning/IntentAnalyzer';
export * from './planning/ContextBuilder';
export * from './planning/PromptBuilder';
export * from './planning/OperationPlanner';

// ── Validation & structured output ───────────────────────────────────────────
export * from './validation/ResponseValidator';
export * from './validation/schemas/common';
export * from './validation/schemas/operationPlan';

// ── Conversation ─────────────────────────────────────────────────────────────
export * from './conversation/Conversation';
export * from './conversation/ConversationManager';

// ── Observability ────────────────────────────────────────────────────────────
export * from './observability/Logger';
export * from './observability/LatencyTracker';
export * from './observability/TokenTracker';
export * from './observability/AIMetrics';

// ── Pipeline (composition + extensibility seam) ──────────────────────────────
export * from './pipeline/IntentHandler';
export * from './pipeline/AIPipeline';

// ── Capability: AI Diagram Generation (Phase 3, Module 2) ────────────────────
export * from './generation';

// ── Capability: Conversational Diagram Editing (Phase 3, Module 3) ───────────
export * from './editing';

// ── Diagram Understanding Engine (Phase 4, Module 1) ─────────────────────────
export * from './understanding';

// ── Capability: Explain Mode (Phase 4, Module 2) ─────────────────────────────
export * from './explain';

// ── Capability: Diagram Review (Phase 4, Module 3) ───────────────────────────
export * from './review';

// ── Capability: Diagram Intelligence Engine (Phase 4, Module 4) ──────────────
export * from './intelligence';
