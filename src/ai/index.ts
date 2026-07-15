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

// ── Capability: Document Intelligence Engine / PKM (Phase 5, Module 1) ────────
export * from './knowledge';

// ── Capability: Reverse Engineering Engine (Phase 5, Module 2) ───────────────
export * from './reverse-engineering';

// ── Project Intelligence Engine / PIM (Phase 5, Module 3) ─────────────────────
export * from './project-intelligence';

// ── AI Execution Framework (Phase 6, Module 1) ───────────────────────────────
export * from './execution/ExecutionFramework';
export * from './execution/ExecutionContext';
export * from './execution/ExecutionUnit';
export * from './execution/ExecutionLifecycle';
export * from './execution/ExecutionManager';
export * from './execution/ExecutionRegistry';
export * from './execution/ExecutionState';
export * from './capabilities/CapabilityDescriptor';
export * from './capabilities/CapabilityRegistry';
export * from './tools/Tool';
export * from './tools/ToolRegistry';
export * from './events/ExecutionEvent';
export * from './events/EventBus';
export * from './permissions/PermissionSystem';
export * from './plugins/Plugin';
export * from './plugins/PluginManager';

// ── Execution Graph & Orchestration (Phase 6, Module 2) ──────────────────────
export * from './execution-graph/SharedPlanningModel';
export * from './execution-graph/ExecutionNode';
export * from './execution-graph/ExecutionEdge';
export * from './execution-graph/ExecutionGraph';
export * from './execution-graph/ExecutionCompiler';
export * from './execution-graph/ExecutionValidator';
export * from './orchestrator/ExecutionOrchestrator';
export * from './orchestrator/Scheduler';
export * from './orchestrator/ResourceManager';
export * from './orchestrator/CheckpointManager';
export * from './orchestrator/FailureManager';
export * from './orchestrator/ApprovalManager';
export * from './orchestrator/progress/ProgressTracker';
export * from './orchestrator/events/OrchestratorEvents';
export * from './orchestrator/policies/ExecutionPolicies';

// ── Specialist Agents Framework (Phase 6, Module 3) ─────────────────────────
export * from './agents/contracts/AgentManifest';
export * from './agents/contracts/AgentContract';
export * from './agents/contracts/AgentRegistry';
export * from './agents/contracts/AgentValidator';
export * from './agents/specialists/BaseSpecialistAgent';
export * from './agents/specialists/ArchitectureAgent';
export * from './agents/specialists/DiagramAgent';
export * from './agents/specialists/DocumentationAgent';
export * from './agents/specialists/RepositoryAgent';
export * from './agents/specialists/SecurityAgent';
export * from './agents/specialists/PerformanceAgent';
export * from './agents/specialists/DatabaseAgent';
export * from './agents/specialists/DevOpsAgent';
export * from './agents/specialists/BackendAgent';
export * from './agents/specialists/FrontendAgent';
export * from './agents/specialists/TestingAgent';
export * from './agents/specialists/ReviewerAgent';

