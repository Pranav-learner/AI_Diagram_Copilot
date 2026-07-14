/**
 * ExplainEngine — the Explain Mode orchestrator.
 *
 * It sequences the pipeline the spec describes, each stage independent:
 *   plan (ExplanationPlanner) → context (Understanding Engine) → prompt
 *   (PromptBuilder) → LLM (AIService) → validate (ResponseValidator) → format.
 * It reasons **only** over the Semantic Graph exposed by the Understanding Engine
 * (never the DSL), keeps a region-aware explanation cache (reusing the engine's
 * {@link RegionCache}) that invalidates when the diagram changes, and supports
 * follow-up questions scoped to the same target/context. Read-only throughout —
 * nothing here mutates the diagram.
 */

import type { AIService } from '../core/AIService';
import type { ChatMessage, TokenUsage } from '../core/types';
import { ZERO_USAGE } from '../core/types';
import { CancelledError } from '../core/AIError';
import { PromptBuilder } from '../planning/PromptBuilder';
import { ResponseValidator } from '../validation/ResponseValidator';
import type { SemanticQuery } from '../understanding';
import { RegionCache } from '../understanding';
import { ExplanationSchema } from './model/Explanation';
import type {
  ExplainInput,
  ExplanationRequest,
  FormattedExplanation,
} from './model/ExplainTypes';
import { ExplanationPlanner } from './ExplanationPlanner';
import { buildExplainContext } from './ContextView';
import { deriveRelatedElements, suggestFollowUpQuestions } from './relatedElements';
import { formatExplanation } from './format';
import { ExplainError } from './errors';
import type { ExplainPhase } from './errors';
import {
  EXPLAIN_PROMPT_ID,
  buildExplainUserPrompt,
  explainPromptVariables,
  registerExplainPrompts,
} from './prompts/explainPrompts';

export const EXPLAIN_STAGES = [
  { stage: 'planning', label: 'Understanding request' },
  { stage: 'context', label: 'Gathering context' },
  { stage: 'generating', label: 'Explaining' },
  { stage: 'formatting', label: 'Formatting' },
] as const satisfies ReadonlyArray<{ stage: ExplainPhase; label: string }>;

type StageState = 'pending' | 'active' | 'done' | 'error';

export interface ExplainStageUpdate {
  readonly stage: ExplainPhase;
  readonly state: StageState;
  readonly detail?: string;
}

export interface ExplainObserver {
  onStage?(update: ExplainStageUpdate): void;
  onToken?(delta: string): void;
}

/** The scoped conversation carried between an explanation and its follow-ups. */
export interface ExplanationSession {
  readonly request: ExplanationRequest;
  /** The context block reused for follow-ups (keeps them cheap + on-topic). */
  readonly contextBlock: string;
  /** Prior turns (user question + assistant answer), for follow-up prompts. */
  readonly conversation: readonly ChatMessage[];
}

export interface ExplanationResult {
  readonly explanation: FormattedExplanation;
  readonly request: ExplanationRequest;
  readonly usage: TokenUsage;
  readonly cached: boolean;
  /** Carries context + history so follow-ups stay scoped to this target. */
  readonly session: ExplanationSession;
}

/**
 * The minimal read surface Explain Mode needs from the Understanding Engine.
 * {@link UnderstandingEngine} satisfies it directly.
 */
export interface SemanticGraphSource {
  query(): SemanticQuery;
  getVersion(): number;
  onUpdate?(listener: (event: { changed: { all: ReadonlySet<string> } }) => void): () => void;
}

export interface ExplainEngineDeps {
  readonly service: AIService;
  readonly graphSource: SemanticGraphSource;
  readonly promptBuilder?: PromptBuilder;
  readonly validator?: ResponseValidator;
  readonly planner?: ExplanationPlanner;
  readonly contextBudget?: number;
  readonly maxAttempts?: number;
  readonly stream?: boolean;
  /** Enable the explanation cache (default true). */
  readonly cache?: boolean;
}

export class ExplainEngine {
  private readonly service: AIService;
  private readonly graphSource: SemanticGraphSource;
  private readonly promptBuilder: PromptBuilder;
  private readonly validator: ResponseValidator;
  private readonly planner: ExplanationPlanner;
  private readonly contextBudget?: number;
  private readonly maxAttempts: number;
  private readonly streamByDefault: boolean;

  private readonly cache?: RegionCache<FormattedExplanation>;
  private readonly detachCache?: () => void;

  constructor(deps: ExplainEngineDeps) {
    this.service = deps.service;
    this.graphSource = deps.graphSource;
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
    if (!this.promptBuilder.registryRef.has(EXPLAIN_PROMPT_ID)) registerExplainPrompts(this.promptBuilder.registryRef);
    this.validator = deps.validator ?? new ResponseValidator({ metrics: deps.service.metrics });
    this.planner = deps.planner ?? new ExplanationPlanner();
    this.contextBudget = deps.contextBudget;
    this.maxAttempts = Math.max(1, deps.maxAttempts ?? 2);
    this.streamByDefault = deps.stream ?? true;

    if (deps.cache ?? true) {
      this.cache = new RegionCache<FormattedExplanation>();
      // Invalidate cached explanations for exactly the regions that changed.
      this.detachCache = this.graphSource.onUpdate?.((event) => this.cache!.invalidate(event.changed.all));
    }
  }

  /** Explain a target. Plans, gathers minimal context, calls the model, formats. */
  async explain(input: ExplainInput, observer: ExplainObserver = {}): Promise<ExplanationResult> {
    let currentStage: ExplainPhase = 'planning';
    const stage = (s: ExplainPhase, state: StageState, detail?: string) => {
      currentStage = s;
      observer.onStage?.({ stage: s, state, detail });
    };
    const ensureLive = () => {
      if (input.signal?.aborted) throw new CancelledError();
    };

    try {
      // ── Planning ───────────────────────────────────────────────────────────
      stage('planning', 'active');
      ensureLive();
      const query = this.graphSource.query();
      this.assertExplainable(query, input);
      const request = this.planner.plan(query, input);
      stage('planning', 'done', request.domain);

      // ── Context ────────────────────────────────────────────────────────────
      stage('context', 'active');
      ensureLive();
      const view = buildExplainContext(query, request, { tokenBudget: this.contextBudget });
      const relatedElements = deriveRelatedElements(query, request);
      const suggestedQuestions = suggestFollowUpQuestions(query, request);
      stage('context', 'done', view.truncated ? `~${view.estimatedTokens} tokens (trimmed)` : `~${view.estimatedTokens} tokens`);

      // ── Cache lookup (only plain explanations, not free-text questions) ──────
      const key = this.cacheKey(request);
      if (this.cache && !request.question) {
        const hit = this.cache.get(key);
        if (hit) {
          stage('generating', 'done', 'cached');
          stage('formatting', 'done');
          return {
            explanation: hit,
            request,
            usage: ZERO_USAGE,
            cached: true,
            session: { request, contextBlock: view.block, conversation: seedConversation(request, hit) },
          };
        }
      }

      // ── Generating + validating (bounded self-heal) ──────────────────────────
      const { explanation, usage } = await this.runWithRetries(request, view.block, [], input, observer, stage);

      // ── Formatting ───────────────────────────────────────────────────────────
      stage('formatting', 'active');
      const formatted = formatExplanation({ request, explanation, relatedElements, suggestedQuestions });
      if (this.cache && !request.question) this.cache.set(key, formatted, view.dependencyIds, this.graphSource.getVersion());
      stage('formatting', 'done');

      return {
        explanation: formatted,
        request,
        usage,
        cached: false,
        session: { request, contextBlock: view.block, conversation: seedConversation(request, formatted) },
      };
    } catch (error) {
      observer.onStage?.({ stage: currentStage, state: 'error', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Ask a follow-up scoped to a prior explanation's target + context. Reuses the
   * session's context block and prior turns so the model stays on-topic ("why?",
   * "give an example", "compare with Redis"). Never cached (it is conversational).
   */
  async followUp(session: ExplanationSession, question: string, observer: ExplainObserver = {}, signal?: AbortSignal): Promise<ExplanationResult> {
    const request: ExplanationRequest = { ...session.request, question };
    const stage = (s: ExplainPhase, state: StageState, detail?: string) => observer.onStage?.({ stage: s, state, detail });
    try {
      stage('generating', 'active');
      const input: ExplainInput = { target: request.target, question, ...(signal ? { signal } : {}) };
      const { explanation, usage } = await this.runWithRetries(request, session.contextBlock, session.conversation, input, observer, stage);

      stage('formatting', 'active');
      // Re-derive related elements/questions against the *current* graph.
      const query = this.graphSource.query();
      const formatted = formatExplanation({
        request,
        explanation,
        relatedElements: deriveRelatedElements(query, request),
        suggestedQuestions: suggestFollowUpQuestions(query, request),
      });
      stage('formatting', 'done');

      const conversation: ChatMessage[] = [
        ...session.conversation,
        { role: 'user', content: question },
        { role: 'assistant', content: explanation.summary },
      ];
      return { explanation: formatted, request, usage, cached: false, session: { request, contextBlock: session.contextBlock, conversation } };
    } catch (error) {
      observer.onStage?.({ stage: 'generating', state: 'error', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /** Release the diagram-change subscription. */
  dispose(): void {
    this.detachCache?.();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private assertExplainable(query: SemanticQuery, input: ExplainInput): void {
    const t = input.target;
    const empty = query.graph.entities.size === 0;
    if (empty && (t.kind === 'diagram' || t.kind === 'selection' || t.kind === 'subgraph')) {
      throw new ExplainError('There is nothing to explain yet — generate or draw a diagram first.', 'planning');
    }
    if ((t.kind === 'selection' || t.kind === 'subgraph' || t.kind === 'timelineSegment') && t.ids.length === 0) {
      throw new ExplainError('Select one or more elements to explain.', 'planning');
    }
  }

  private async runWithRetries(
    request: ExplanationRequest,
    contextBlock: string,
    conversation: readonly ChatMessage[],
    input: ExplainInput,
    observer: ExplainObserver,
    stage: (s: ExplainPhase, state: StageState, detail?: string) => void,
  ): Promise<{ explanation: import('./model/Explanation').Explanation; usage: TokenUsage }> {
    const variables = explainPromptVariables(request);
    let correction: string | undefined;
    let usage: TokenUsage = ZERO_USAGE;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (input.signal?.aborted) throw new CancelledError();
      stage('generating', 'active', attempt > 0 ? `retry ${attempt}` : undefined);
      const user = buildExplainUserPrompt(request, { correction });
      const messages = this.promptBuilder.build({
        template: { id: EXPLAIN_PROMPT_ID },
        user,
        contextBlock,
        conversation,
        variables,
      });
      const completion = await this.runModel(messages, input, observer);
      usage = completion.usage;

      stage('validating', 'active');
      const parsed = this.validator.validate(completion.text, ExplanationSchema, {
        minConfidence: this.service.config.validation.minConfidence,
      });
      if (parsed.ok) {
        stage('generating', 'done');
        return { explanation: parsed.value, usage };
      }
      correction = parsed.issues.map((i) => `- ${i.path ?? '<root>'}: ${i.message}`).join('\n');
      if (attempt + 1 >= this.maxAttempts) {
        stage('generating', 'error', 'invalid response');
        throw new ExplainError('The explanation could not be produced from this diagram.', 'validating', parsed.issues);
      }
    }
    // Unreachable: the loop returns or throws.
    throw new ExplainError('Failed to produce an explanation.', 'generating');
  }

  private async runModel(
    messages: readonly ChatMessage[],
    input: ExplainInput,
    observer: ExplainObserver,
  ): Promise<{ text: string; usage: TokenUsage }> {
    const opts = { signal: input.signal, tier: 'reasoning' as const, intent: 'explain' };
    if (!(input.stream ?? this.streamByDefault)) {
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

  private cacheKey(request: ExplanationRequest): string {
    return JSON.stringify({
      t: request.target,
      depth: request.depth,
      audience: request.audience,
      style: request.style,
      domain: request.domain,
      q: request.question ?? null,
    });
  }
}

/** Seed a session's conversation from a produced explanation (for follow-ups). */
function seedConversation(request: ExplanationRequest, explanation: FormattedExplanation): ChatMessage[] {
  return [
    { role: 'user', content: buildExplainUserPrompt(request) },
    { role: 'assistant', content: explanation.summary },
  ];
}
