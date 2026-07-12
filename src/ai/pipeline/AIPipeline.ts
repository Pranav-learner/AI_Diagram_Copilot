/**
 * AIPipeline — the generic orchestrator wiring the whole flow together.
 *
 *   user turn → IntentAnalyzer → ContextBuilder → PromptBuilder → AIService
 *             → ResponseValidator → IntentHandler.toOperations
 *             → OperationPlanner → DiagramGateway → runtime
 *
 * It contains **no feature logic** — it ships with an empty {@link HandlerRegistry}
 * and simply sequences the infrastructure. A capability becomes reachable the
 * moment its {@link IntentHandler} is registered; nothing here changes. This is
 * the concrete demonstration that "future features only implement Intent,
 * Prompt, and Planner." Read-only intents flow through untouched (no operations);
 * unhandled intents return a well-formed "unhandled" result rather than throwing.
 */

import type { ChatMessage } from '../core/types';
import type { AIService } from '../core/AIService';
import { ResponseValidator } from '../validation/ResponseValidator';
import type { IntentAnalyzer, IntentClassification, IntentInput } from '../planning/IntentAnalyzer';
import { ContextBuilder } from '../planning/ContextBuilder';
import type { DiagramContext, DiagramContextSource } from '../planning/ContextBuilder';
import { PromptBuilder } from '../planning/PromptBuilder';
import { OperationPlanner } from '../planning/OperationPlanner';
import type { DiagramGateway, OperationApplyResult } from '../planning/OperationPlanner';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import { HandlerRegistry } from './IntentHandler';
import type { HandlerContext } from './IntentHandler';

export interface AIPipelineDeps {
  readonly service: AIService;
  readonly handlers?: HandlerRegistry;
  readonly intentAnalyzer: IntentAnalyzer;
  readonly promptBuilder?: PromptBuilder;
  readonly contextBuilder?: ContextBuilder;
  readonly validator?: ResponseValidator;
  readonly planner?: OperationPlanner;
  /** Read-side port; when present the pipeline injects diagram context. */
  readonly contextSource?: DiagramContextSource;
  /** Write-side port; when present the pipeline applies compiled operations. */
  readonly gateway?: DiagramGateway;
}

export interface RunOptions {
  readonly signal?: AbortSignal;
  /** Prior conversation turns to include in the prompt. */
  readonly conversation?: readonly ChatMessage[];
  /** Apply compiled operations to the runtime (requires a gateway). Default true. */
  readonly apply?: boolean;
}

export interface PipelineResult {
  readonly classification: IntentClassification;
  /** False when no handler is registered for the classified intent. */
  readonly handled: boolean;
  /** The validated structured response, when a handler ran. */
  readonly plan?: unknown;
  /** Compiled operations, when the handler is a write capability. */
  readonly operations?: OperationPlan;
  /** Result of applying the operations, when applied. */
  readonly applied?: OperationApplyResult;
}

export class AIPipeline {
  private readonly deps: AIPipelineDeps;
  private readonly handlers: HandlerRegistry;
  private readonly promptBuilder: PromptBuilder;
  private readonly contextBuilder: ContextBuilder;
  private readonly validator: ResponseValidator;
  private readonly planner: OperationPlanner;

  constructor(deps: AIPipelineDeps) {
    this.deps = deps;
    this.handlers = deps.handlers ?? new HandlerRegistry();
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
    this.contextBuilder = deps.contextBuilder ?? new ContextBuilder();
    this.validator = deps.validator ?? new ResponseValidator();
    this.planner = deps.planner ?? new OperationPlanner();
  }

  get handlerRegistry(): HandlerRegistry {
    return this.handlers;
  }

  /** Run one user turn end-to-end. */
  async run(input: IntentInput, opts: RunOptions = {}): Promise<PipelineResult> {
    const classification = await this.deps.intentAnalyzer.analyze(input);
    const handler = this.handlers.get(classification.intent);
    if (!handler) return { classification, handled: false };

    // Build diagram context (read port) if available.
    let diagramContext: DiagramContext | undefined;
    let contextBlock: string | undefined;
    if (this.deps.contextSource) {
      diagramContext = this.contextBuilder.build(this.deps.contextSource);
      contextBlock = this.contextBuilder.render(diagramContext);
    }

    // Prompt → completion → validate.
    const messages = this.promptBuilder.build({
      template: handler.promptTemplate,
      user: input.text,
      contextBlock,
      conversation: opts.conversation,
    });
    const response = await this.deps.service.complete(
      { messages, responseFormat: { type: 'json' } },
      { signal: opts.signal, tier: handler.tier, intent: classification.intent },
    );
    const plan = this.validator.validateOrThrow(response.text, handler.schema);

    // Read-only capability: nothing to compile/apply.
    if (!handler.toOperations) return { classification, handled: true, plan };

    const ctx: HandlerContext = { input, classification, diagramContext };
    const operations = handler.toOperations(plan, ctx);

    const shouldApply = (opts.apply ?? true) && this.deps.gateway !== undefined;
    if (!shouldApply) return { classification, handled: true, plan, operations };

    const applied = this.planner.execute(operations, this.deps.gateway!);
    return { classification, handled: true, plan, operations, applied };
  }
}
