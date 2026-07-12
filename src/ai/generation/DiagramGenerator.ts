/**
 * DiagramGenerator — the generation orchestrator and the module's front door.
 *
 * Sequences the isolated stages of the pipeline and reports **staged progress**
 * (not a spinner): Understanding → Building plan → Validating → Computing layout
 * → Creating diagram → Rendering. It streams plan tokens, supports cancellation
 * at every boundary, and **self-heals** a malformed/invalid plan by re-prompting
 * with the validation feedback (bounded). No LLM output reaches the runtime
 * without passing schema + semantic validation, and operations are produced only
 * by the {@link ExecutionPlanner}. A failure never mutates the diagram — the
 * runtime is touched exactly once, atomically, at the executing stage.
 */

import type { AIService } from '../core/AIService';
import type { ChatMessage, TokenUsage } from '../core/types';
import { ZERO_USAGE } from '../core/types';
import { CancelledError, PlanningError } from '../core/AIError';
import { PromptBuilder } from '../planning/PromptBuilder';
import type { TemplateRef } from '../planning/PromptBuilder';
import { ContextBuilder } from '../planning/ContextBuilder';
import type { DiagramContextSource } from '../planning/ContextBuilder';
import { ResponseValidator } from '../validation/ResponseValidator';
import type { DiagramGateway, OperationApplyResult } from '../planning/OperationPlanner';
import { DiagramPlanSchema } from './model/DiagramPlan';
import type { DiagramPlan } from './model/DiagramPlan';
import type { DiagramType, DiagramTypeRegistry } from './model/DiagramType';
import { ExecutionPlanner } from './ExecutionPlanner';
import type { ExecutionResult } from './ExecutionPlanner';
import { validatePlan } from './validation/validatePlan';
import type { PlanIssue } from './validation/validatePlan';
import { GenerationError } from './errors';
import type { GenerationPhase } from './errors';
import {
  GENERATION_PROMPT_ID,
  buildGenerationUserPrompt,
  registerGenerationPrompts,
} from './prompts/generationPrompts';

/** The ordered, user-facing stages of a generation run. */
export const GENERATION_STAGES = [
  { stage: 'understanding', label: 'Understanding request' },
  { stage: 'planning', label: 'Building plan' },
  { stage: 'validating', label: 'Validating plan' },
  { stage: 'layout', label: 'Computing layout' },
  { stage: 'executing', label: 'Creating diagram' },
  { stage: 'rendering', label: 'Rendering canvas' },
] as const satisfies ReadonlyArray<{ stage: GenerationPhase; label: string }>;

export type StageState = 'pending' | 'active' | 'done' | 'error';

export interface StageUpdate {
  readonly stage: GenerationPhase;
  readonly state: StageState;
  readonly detail?: string;
}

export interface GenerationObserver {
  /** Called on every stage transition (for the progress UI). */
  onStage?(update: StageUpdate): void;
  /** Called with each streamed plan token (raw JSON text). */
  onToken?(delta: string): void;
}

export interface GenerateRequest {
  readonly prompt: string;
  /** Optional preferred diagram type. */
  readonly diagramType?: DiagramType;
  readonly signal?: AbortSignal;
  /** Ask for a distinct variation of a previous result. */
  readonly regenerate?: boolean;
  /** Stream tokens (default true). */
  readonly stream?: boolean;
}

export interface GenerationTimings {
  readonly totalMs: number;
  readonly planningMs: number;
  readonly validationMs: number;
  readonly layoutMs: number;
  readonly executionMs: number;
}

export interface GenerationResult {
  readonly plan: DiagramPlan;
  readonly execution: ExecutionResult;
  readonly applied: OperationApplyResult;
  readonly usage: TokenUsage;
  readonly timings: GenerationTimings;
  /** Non-fatal plan warnings surfaced to the caller. */
  readonly warnings: readonly PlanIssue[];
  /** Attempts consumed (>1 means a self-heal retry occurred). */
  readonly attempts: number;
}

export interface DiagramGeneratorDeps {
  readonly service: AIService;
  readonly gateway: DiagramGateway;
  readonly promptBuilder?: PromptBuilder;
  readonly contextBuilder?: ContextBuilder;
  /** When present, current-diagram context is injected (e.g. regeneration). */
  readonly contextSource?: DiagramContextSource;
  readonly validator?: ResponseValidator;
  readonly executionPlanner?: ExecutionPlanner;
  readonly typeRegistry?: DiagramTypeRegistry;
  readonly promptRef?: TemplateRef;
  /** Max plan attempts including self-heal retries (default 2). */
  readonly maxPlanAttempts?: number;
  readonly now?: () => number;
  readonly stream?: boolean;
}

export class DiagramGenerator {
  private readonly service: AIService;
  private readonly gateway: DiagramGateway;
  private readonly promptBuilder: PromptBuilder;
  private readonly contextBuilder: ContextBuilder;
  private readonly contextSource?: DiagramContextSource;
  private readonly validator: ResponseValidator;
  private readonly executionPlanner: ExecutionPlanner;
  private readonly promptRef: TemplateRef;
  private readonly maxPlanAttempts: number;
  private readonly now: () => number;
  private readonly streamByDefault: boolean;

  constructor(deps: DiagramGeneratorDeps) {
    this.service = deps.service;
    this.gateway = deps.gateway;
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
    // Ensure the generation template is registered regardless of who built the builder.
    if (!this.promptBuilder.registryRef.has(GENERATION_PROMPT_ID)) {
      registerGenerationPrompts(this.promptBuilder.registryRef);
    }
    this.contextBuilder = deps.contextBuilder ?? new ContextBuilder();
    this.contextSource = deps.contextSource;
    this.validator = deps.validator ?? new ResponseValidator({ metrics: deps.service.metrics });
    this.executionPlanner = deps.executionPlanner ?? new ExecutionPlanner({ typeRegistry: deps.typeRegistry });
    this.promptRef = deps.promptRef ?? { id: GENERATION_PROMPT_ID };
    this.maxPlanAttempts = Math.max(1, deps.maxPlanAttempts ?? 2);
    this.now = deps.now ?? (() => Date.now());
    this.streamByDefault = deps.stream ?? true;
  }

  async generate(request: GenerateRequest, observer: GenerationObserver = {}): Promise<GenerationResult> {
    const started = this.now();
    let planningMs = 0;
    let validationMs = 0;
    let currentStage: GenerationPhase = 'understanding';

    const stage = (s: GenerationPhase, state: StageState, detail?: string) => {
      currentStage = s;
      observer.onStage?.({ stage: s, state, detail });
    };
    const ensureLive = () => {
      if (request.signal?.aborted) throw new CancelledError();
    };

    try {
      // ── Understanding: assemble any diagram context ───────────────────────
      stage('understanding', 'active');
      ensureLive();
      const contextBlock = this.buildContextBlock();
      stage('understanding', 'done');

      // ── Building plan + validating (with bounded self-heal) ───────────────
      let plan: DiagramPlan | undefined;
      let usage: TokenUsage = ZERO_USAGE;
      let warnings: readonly PlanIssue[] = [];
      let correction: string | undefined;
      let attempt = 0;

      for (; attempt < this.maxPlanAttempts && !plan; attempt++) {
        ensureLive();
        stage('planning', 'active', attempt > 0 ? `retry ${attempt}` : undefined);
        const planStart = this.now();
        const user = buildGenerationUserPrompt(request.prompt, {
          diagramType: request.diagramType,
          regenerate: request.regenerate,
          correction,
        });
        const messages = this.promptBuilder.build({ template: this.promptRef, user, contextBlock });
        const completion = await this.runModel(messages, request, observer);
        usage = completion.usage;
        planningMs += this.now() - planStart;
        stage('planning', 'done');

        // Validate schema then semantics.
        stage('validating', 'active');
        const valStart = this.now();
        const outcome = this.validate(completion.text);
        validationMs += this.now() - valStart;

        if (!outcome.ok) {
          correction = outcome.correction;
          if (attempt + 1 >= this.maxPlanAttempts) {
            stage('validating', 'error', outcome.correction);
            throw outcome.error;
          }
          stage('validating', 'done', 'invalid — retrying');
          continue;
        }
        plan = outcome.plan;
        warnings = outcome.warnings;
        stage('validating', 'done', warnings.length ? `${warnings.length} warning(s)` : undefined);
      }

      // `plan` is defined here: the loop either set it or threw.
      const validatedPlan = plan!;

      // ── Computing layout ──────────────────────────────────────────────────
      ensureLive();
      stage('layout', 'active');
      const layoutStart = this.now();
      const ctx = this.executionPlanner.computeLayout(validatedPlan);
      const layoutMs = this.now() - layoutStart;
      stage('layout', 'done', `${validatedPlan.nodes.length} nodes`);

      // ── Creating diagram (compile → validate op types → apply, atomically) ─
      ensureLive();
      stage('executing', 'active');
      const execStart = this.now();
      const execution = this.executionPlanner.compile(validatedPlan, ctx);
      this.assertKnownOperations(execution);
      const applied = this.gateway.apply(execution.operations);
      const executionMs = this.now() - execStart;
      stage('executing', 'done', `${applied.applied} operations`);

      // ── Rendering (the runtime commit drives the canvas via the bridge) ────
      stage('rendering', 'active');
      stage('rendering', 'done');

      return {
        plan: validatedPlan,
        execution,
        applied,
        usage,
        timings: { totalMs: this.now() - started, planningMs, validationMs, layoutMs, executionMs },
        warnings,
        attempts: attempt,
      };
    } catch (error) {
      observer.onStage?.({ stage: currentStage, state: 'error', detail: errorMessage(error) });
      throw error;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private buildContextBlock(): string | undefined {
    if (!this.contextSource) return undefined;
    const context = this.contextBuilder.build(this.contextSource);
    // Only inject context when there is an existing diagram worth extending.
    if (context.diagram.counts.nodes === 0) return undefined;
    return this.contextBuilder.render(context);
  }

  private async runModel(
    messages: readonly ChatMessage[],
    request: GenerateRequest,
    observer: GenerationObserver,
  ): Promise<{ text: string; usage: TokenUsage }> {
    const opts = { signal: request.signal, tier: 'reasoning' as const, intent: 'generate' };
    const useStream = request.stream ?? this.streamByDefault;
    if (!useStream) {
      const response = await this.service.complete({ messages, responseFormat: { type: 'json' } }, opts);
      observer.onToken?.(response.text);
      return { text: response.text, usage: response.usage };
    }
    let text = '';
    let usage: TokenUsage = ZERO_USAGE;
    for await (const chunk of this.service.stream({ messages, responseFormat: { type: 'json' } }, opts)) {
      if (chunk.delta) {
        text += chunk.delta;
        observer.onToken?.(chunk.delta);
      }
      if (chunk.usage) usage = chunk.usage;
    }
    return { text, usage };
  }

  /** Schema + semantic validation of raw model text. */
  private validate(
    text: string,
  ):
    | { ok: true; plan: DiagramPlan; warnings: readonly PlanIssue[] }
    | { ok: false; correction: string; error: GenerationError } {
    const minConfidence = this.service.config.validation.minConfidence;
    const parsed = this.validator.validate(text, DiagramPlanSchema, { minConfidence });
    if (!parsed.ok) {
      const correction = parsed.issues.map((i) => `- ${i.path ?? '<root>'}: ${i.message}`).join('\n');
      return {
        ok: false,
        correction,
        error: new GenerationError('The generated plan did not match the schema', 'validating'),
      };
    }

    const semantic = validatePlan(parsed.value);
    if (!semantic.ok) {
      const correction = semantic.errors.map((i) => `- ${i.message}`).join('\n');
      return {
        ok: false,
        correction,
        error: new GenerationError('The generated plan was structurally invalid', 'validating', semantic.errors),
      };
    }
    return { ok: true, plan: parsed.value, warnings: semantic.warnings };
  }

  /** Defense in depth: every operation type must be one the runtime can execute. */
  private assertKnownOperations(execution: ExecutionResult): void {
    const known = new Set(this.gateway.knownOperationTypes());
    const unknown = execution.operations.operations.filter((op) => !known.has(op.type));
    if (unknown.length > 0) {
      throw new PlanningError(
        `Execution plan contains unknown operations: ${[...new Set(unknown.map((o) => o.type))].join(', ')}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
