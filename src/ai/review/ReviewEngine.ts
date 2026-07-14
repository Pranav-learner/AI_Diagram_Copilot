/**
 * ReviewEngine — the Diagram Review orchestrator.
 *
 * It runs the pipeline the spec describes, with the critical ordering that
 * **static analysis precedes the LLM**:
 *   analyze (rules → findings) → score → plan → explain (LLM) → format.
 * Discovery and scoring are fully deterministic; the LLM only interprets. If the
 * model is unavailable, slow, or returns junk, the review **degrades gracefully**
 * to a findings-and-scores-only result rather than failing. Results are cached
 * region-aware (via the Understanding Engine's RegionCache) and invalidated when
 * the diagram changes. Read-only throughout — reviewing never mutates the diagram.
 */

import type { AIService } from '../core/AIService';
import type { ChatMessage, TokenUsage } from '../core/types';
import { ZERO_USAGE } from '../core/types';
import { CancelledError } from '../core/AIError';
import { PromptBuilder } from '../planning/PromptBuilder';
import { ResponseValidator } from '../validation/ResponseValidator';
import { RegionCache } from '../understanding';
import { detectDomain, type ExplanationDomain, type SemanticGraphSource } from '../explain';
import type { AnalysisResult } from './analysis/StaticAnalysisEngine';
import { StaticAnalysisEngine } from './analysis/StaticAnalysisEngine';
import { defaultRuleRegistry } from './analysis/rules';
import type { RuleRegistry } from './model/Rule';
import { ReviewExplanationSchema, type FormattedReview, type ReviewExplanation, type ReviewScope, type ReviewScores } from './model/Review';
import { computeScores, deriveStrengths } from './scoring/ReviewScorer';
import { buildReviewContext } from './ReviewPlanner';
import { formatReview } from './ReviewFormatter';
import { ReviewError, type ReviewPhase } from './errors';
import {
  REVIEW_PROMPT_ID,
  buildReviewUserPrompt,
  registerReviewPrompts,
  reviewPromptVariables,
} from './prompts/reviewPrompts';

export const REVIEW_STAGES = [
  { stage: 'analyzing', label: 'Analyzing structure' },
  { stage: 'scoring', label: 'Scoring' },
  { stage: 'planning', label: 'Preparing review' },
  { stage: 'explaining', label: 'Explaining findings' },
  { stage: 'formatting', label: 'Formatting' },
] as const satisfies ReadonlyArray<{ stage: ReviewPhase; label: string }>;

type StageState = 'pending' | 'active' | 'done' | 'error';

export interface ReviewStageUpdate {
  readonly stage: ReviewPhase;
  readonly state: StageState;
  readonly detail?: string;
}

export interface ReviewObserver {
  onStage?(update: ReviewStageUpdate): void;
  onToken?(delta: string): void;
}

export interface ReviewInput {
  /** What to review. Default: the whole diagram. */
  readonly scope?: ReviewScope;
  /** Override the auto-detected domain. */
  readonly domain?: ExplanationDomain;
  /** The user's free-text ask, if any. */
  readonly request?: string;
  /** Use the LLM to explain findings (default true). When false, deterministic-only. */
  readonly useLLM?: boolean;
  readonly signal?: AbortSignal;
  readonly stream?: boolean;
}

export interface ReviewResult {
  readonly review: FormattedReview;
  readonly analysis: AnalysisResult;
  readonly scores: ReviewScores;
  readonly domain: ExplanationDomain;
  readonly usage: TokenUsage;
  readonly cached: boolean;
  readonly degraded: boolean;
}

export interface ReviewEngineDeps {
  readonly service: AIService;
  readonly graphSource: SemanticGraphSource;
  readonly registry?: RuleRegistry;
  readonly analysisEngine?: StaticAnalysisEngine;
  readonly promptBuilder?: PromptBuilder;
  readonly validator?: ResponseValidator;
  readonly maxAttempts?: number;
  readonly stream?: boolean;
  readonly cache?: boolean;
}

export class ReviewEngine {
  private readonly service: AIService;
  private readonly graphSource: SemanticGraphSource;
  private readonly analysisEngine: StaticAnalysisEngine;
  private readonly promptBuilder: PromptBuilder;
  private readonly validator: ResponseValidator;
  private readonly maxAttempts: number;
  private readonly streamByDefault: boolean;
  private readonly cache?: RegionCache<ReviewResult>;
  private readonly detachCache?: () => void;

  constructor(deps: ReviewEngineDeps) {
    this.service = deps.service;
    this.graphSource = deps.graphSource;
    this.analysisEngine = deps.analysisEngine ?? new StaticAnalysisEngine(deps.registry ?? defaultRuleRegistry());
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
    if (!this.promptBuilder.registryRef.has(REVIEW_PROMPT_ID)) registerReviewPrompts(this.promptBuilder.registryRef);
    this.validator = deps.validator ?? new ResponseValidator({ metrics: deps.service.metrics });
    this.maxAttempts = Math.max(1, deps.maxAttempts ?? 2);
    this.streamByDefault = deps.stream ?? true;
    if (deps.cache ?? true) {
      this.cache = new RegionCache<ReviewResult>();
      this.detachCache = this.graphSource.onUpdate?.((event) => this.cache!.invalidate(event.changed.all));
    }
  }

  async review(input: ReviewInput = {}, observer: ReviewObserver = {}): Promise<ReviewResult> {
    let currentStage: ReviewPhase = 'analyzing';
    const stage = (s: ReviewPhase, state: StageState, detail?: string) => {
      currentStage = s;
      observer.onStage?.({ stage: s, state, detail });
    };
    const ensureLive = () => {
      if (input.signal?.aborted) throw new CancelledError();
    };

    try {
      const scope: ReviewScope = input.scope ?? { kind: 'whole' };
      const query = this.graphSource.query();
      const graph = query.graph;
      if (graph.entities.size === 0) throw new ReviewError('There is nothing to review yet — generate or draw a diagram first.', 'analyzing');
      if (scope.kind === 'selection' && scope.ids.length === 0) throw new ReviewError('Select one or more elements to review.', 'analyzing');

      const domain = input.domain ?? detectDomain(graph);

      // ── Cache lookup ─────────────────────────────────────────────────────────
      const key = this.cacheKey(scope, domain, input);
      if (this.cache) {
        const hit = this.cache.get(key);
        if (hit) {
          stage('formatting', 'done', 'cached');
          return { ...hit, cached: true, usage: ZERO_USAGE };
        }
      }

      // ── Analyze (static, deterministic) ──────────────────────────────────────
      stage('analyzing', 'active');
      ensureLive();
      const analysis = this.analysisEngine.analyze({
        graph,
        query,
        domain,
        ...(scope.kind === 'selection' ? { scope: scope.ids } : {}),
      });
      stage('analyzing', 'done', `${analysis.findings.length} finding(s), ${analysis.rulesRun} rules`);

      // ── Score (deterministic) ────────────────────────────────────────────────
      stage('scoring', 'active');
      const scores = computeScores(analysis.findings, graph, domain);
      const strengths = deriveStrengths(graph, domain);
      stage('scoring', 'done', `${scores.overall.score}/100`);

      // ── Explain (LLM, optional, degrade-safe) ────────────────────────────────
      let explanation: ReviewExplanation | undefined;
      let usage: TokenUsage = ZERO_USAGE;
      let degraded = false;

      if (input.useLLM ?? true) {
        stage('planning', 'active');
        const view = buildReviewContext(query, analysis.findings, scores, scope);
        stage('planning', 'done', `~${view.estimatedTokens} tokens`);
        try {
          stage('explaining', 'active');
          const outcome = await this.runLLM(view.block, domain, input, observer, stage);
          explanation = outcome.explanation;
          usage = outcome.usage;
          stage('explaining', 'done');
        } catch (error) {
          if (error instanceof CancelledError) throw error;
          // Graceful degradation: keep the deterministic review, drop the prose.
          degraded = true;
          stage('explaining', 'error', 'LLM unavailable — showing deterministic review');
        }
      } else {
        degraded = true;
      }

      // ── Format ───────────────────────────────────────────────────────────────
      stage('formatting', 'active');
      const review = formatReview({ domain, scope, findings: analysis.findings, scores, strengths, ...(explanation ? { explanation } : {}), degraded });
      stage('formatting', 'done');

      const result: ReviewResult = { review, analysis, scores, domain, usage, cached: false, degraded };
      if (this.cache) this.cache.set(key, result, this.depsFor(scope, review.affectedEntities), this.graphSource.getVersion());
      return result;
    } catch (error) {
      observer.onStage?.({ stage: currentStage, state: 'error', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  dispose(): void {
    this.detachCache?.();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async runLLM(
    contextBlock: string,
    domain: ExplanationDomain,
    input: ReviewInput,
    observer: ReviewObserver,
    stage: (s: ReviewPhase, state: StageState, detail?: string) => void,
  ): Promise<{ explanation: ReviewExplanation; usage: TokenUsage }> {
    const variables = reviewPromptVariables(domain);
    let correction: string | undefined;
    let usage: TokenUsage = ZERO_USAGE;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (input.signal?.aborted) throw new CancelledError();
      if (attempt > 0) stage('explaining', 'active', `retry ${attempt}`);
      const user = buildReviewUserPrompt({ ...(input.request ? { request: input.request } : {}), ...(correction ? { correction } : {}) });
      const messages = this.promptBuilder.build({ template: { id: REVIEW_PROMPT_ID }, user, contextBlock, variables });
      const completion = await this.runModel(messages, input, observer);
      usage = completion.usage;
      const parsed = this.validator.validate(completion.text, ReviewExplanationSchema, {
        minConfidence: this.service.config.validation.minConfidence,
      });
      if (parsed.ok) return { explanation: parsed.value, usage };
      correction = parsed.issues.map((i) => `- ${i.path ?? '<root>'}: ${i.message}`).join('\n');
    }
    throw new ReviewError('The model did not return a valid review explanation.', 'explaining');
  }

  private async runModel(
    messages: readonly ChatMessage[],
    input: ReviewInput,
    observer: ReviewObserver,
  ): Promise<{ text: string; usage: TokenUsage }> {
    const opts = { signal: input.signal, tier: 'reasoning' as const, intent: 'review' };
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

  private cacheKey(scope: ReviewScope, domain: ExplanationDomain, input: ReviewInput): string {
    return JSON.stringify({ scope, domain, request: input.request ?? null, useLLM: input.useLLM ?? true });
  }

  /** Cache dependency region. Whole-diagram reviews invalidate on any change. */
  private depsFor(scope: ReviewScope, affected: readonly string[]): readonly string[] {
    if (scope.kind === 'whole') return []; // empty ⇒ RegionCache evicts on any change
    const deps = new Set<string>([...scope.ids, ...affected]);
    for (const id of scope.ids) for (const n of this.graphSource.query().graph.index.neighbors(id)) deps.add(n);
    return [...deps];
  }
}
