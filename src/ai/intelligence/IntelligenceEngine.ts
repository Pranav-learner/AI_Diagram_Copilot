/**
 * IntelligenceEngine — the proactive reasoning layer.
 *
 * It watches the diagram (via the Understanding Engine's change stream), runs the
 * deterministic Static Analysis Engine, reconciles the findings into a stateful
 * {@link FindingRepository}, aggregates them into merged {@link Insight}s, and
 * ranks them — all without the LLM. The result is a proactive **insight feed** that
 * stays current as the diagram changes. The LLM is used only, and lazily, to turn
 * the top insights into a first-person **briefing** ("I noticed…"); if it is
 * unavailable the feed and a deterministic briefing still work.
 *
 * Single-responsibility pipeline:
 *   graph change → analyze → repository.reconcile → aggregate → prioritize → feed
 *                                                              ↘ (on demand) LLM briefing
 *
 * Reasoning is kept strictly separate from deterministic discovery.
 */

import type { AIService } from '../core/AIService';
import type { ChatMessage, TokenUsage } from '../core/types';
import { ZERO_USAGE } from '../core/types';
import { CancelledError } from '../core/AIError';
import { PromptBuilder } from '../planning/PromptBuilder';
import { ResponseValidator } from '../validation/ResponseValidator';
import { detectDomain, type ExplanationDomain, type SemanticGraphSource } from '../explain';
import { StaticAnalysisEngine, defaultRuleRegistry, type ReviewCategory, type RuleRegistry, type Severity } from '../review';
import { FindingRepository, type RepositoryStats } from './FindingRepository';
import { IntelligenceTimeline } from './IntelligenceTimeline';
import type { TimelineEvent } from './model/Timeline';
import { buildInsights } from './aggregation';
import { prioritize, type PriorityContext } from './prioritization';
import type { Insight } from './model/Insight';
import type { FormattedBriefing, InsightBriefing } from './model/Briefing';
import { InsightBriefingSchema } from './model/Briefing';
import { formatBriefing } from './InsightFormatter';
import { buildBriefingContext } from './InsightPlanner';
import {
  INSIGHT_PROMPT_ID,
  buildBriefingUserPrompt,
  insightPromptVariables,
  registerInsightPrompts,
} from './prompts/insightPrompts';

export interface FeedFilter {
  readonly severity?: Severity;
  readonly category?: ReviewCategory;
  readonly type?: string;
  readonly search?: string;
}

export interface SuggestedAction {
  readonly kind: 'explain' | 'review' | 'improve';
  readonly label: string;
  readonly targetIds?: readonly string[];
  readonly insightId?: string;
}

export interface ContextualSuggestions {
  readonly insights: readonly Insight[];
  readonly actions: readonly SuggestedAction[];
}

export interface IntelligenceSnapshot {
  readonly insights: readonly Insight[];
  readonly stats: RepositoryStats;
  readonly timeline: readonly TimelineEvent[];
  readonly version: number;
  readonly degradedAnalysis: boolean;
}

export interface IntelligenceMetrics {
  readonly activeInsights: number;
  readonly suppressedDuplicates: number;
  readonly dismissed: number;
  readonly accepted: number;
  readonly resolvedByUser: number;
  readonly lastAnalysisMs: number;
  readonly lastBriefingMs: number;
  readonly timelineEvents: number;
}

export interface BriefingResult {
  readonly briefing: FormattedBriefing;
  readonly insights: readonly Insight[];
  readonly usage: TokenUsage;
  readonly cached: boolean;
  readonly degraded: boolean;
}

export interface IntelligenceEngineDeps {
  readonly graphSource: SemanticGraphSource;
  /** Optional — enables the LLM briefing. Without it, the feed is deterministic. */
  readonly service?: AIService;
  readonly registry?: RuleRegistry;
  readonly analysisEngine?: StaticAnalysisEngine;
  readonly promptBuilder?: PromptBuilder;
  readonly validator?: ResponseValidator;
  readonly now?: () => number;
  /** Auto-refresh on diagram change (default true). */
  readonly autoRun?: boolean;
  readonly maxAttempts?: number;
  readonly stream?: boolean;
}

type UpdateListener = (snapshot: IntelligenceSnapshot) => void;

const defaultTimer = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export class IntelligenceEngine {
  private readonly graphSource: SemanticGraphSource;
  private readonly service?: AIService;
  private readonly analysisEngine: StaticAnalysisEngine;
  private readonly promptBuilder: PromptBuilder;
  private readonly validator: ResponseValidator;
  private readonly maxAttempts: number;
  private readonly streamByDefault: boolean;
  private readonly timer = defaultTimer;

  private readonly repository: FindingRepository;
  private readonly timeline: IntelligenceTimeline;
  private readonly recentlyTouched = new Set<string>();
  private readonly listeners = new Set<UpdateListener>();
  private detach?: () => void;

  private insights: Insight[] = [];
  private domain: ExplanationDomain = 'generic';
  private lastVersion = -1;
  private degradedAnalysis = false;
  private briefingCache?: { version: number; result: BriefingResult };

  // Observability counters.
  private suppressedDuplicates = 0;
  private dismissedCount = 0;
  private acceptedCount = 0;
  private resolvedByUser = 0;
  private lastAnalysisMs = 0;
  private lastBriefingMs = 0;

  constructor(deps: IntelligenceEngineDeps) {
    this.graphSource = deps.graphSource;
    this.service = deps.service;
    this.analysisEngine = deps.analysisEngine ?? new StaticAnalysisEngine(deps.registry ?? defaultRuleRegistry());
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
    if (!this.promptBuilder.registryRef.has(INSIGHT_PROMPT_ID)) registerInsightPrompts(this.promptBuilder.registryRef);
    this.validator = deps.validator ?? new ResponseValidator(deps.service ? { metrics: deps.service.metrics } : {});
    this.maxAttempts = Math.max(1, deps.maxAttempts ?? 2);
    this.streamByDefault = deps.stream ?? true;
    const now = deps.now ?? Date.now;
    this.repository = new FindingRepository(now);
    this.timeline = new IntelligenceTimeline(now);

    this.refresh(true);
    if (deps.autoRun ?? true) this.detach = this.graphSource.onUpdate?.(() => this.refresh());
  }

  // ── Proactive refresh ─────────────────────────────────────────────────────

  /** Re-analyse if the diagram changed (or `force`), reconcile, and re-rank. */
  refresh(force = false): IntelligenceSnapshot {
    const version = this.graphSource.getVersion();
    if (!force && version === this.lastVersion) return this.snapshot();
    this.analyzeAndReconcile(version);
    return this.snapshot();
  }

  private analyzeAndReconcile(version: number): void {
    this.lastVersion = version;
    const query = this.graphSource.query();
    const graph = query.graph;
    this.domain = graph.entities.size === 0 ? 'generic' : detectDomain(graph);

    let findings;
    try {
      const t0 = this.timer();
      findings = this.analysisEngine.analyze({ graph, query, domain: this.domain }).findings;
      this.lastAnalysisMs = this.timer() - t0;
      this.degradedAnalysis = false;
    } catch {
      // Analysis failed — keep the previous insights (graceful degradation).
      this.degradedAnalysis = true;
      return;
    }

    const diff = this.repository.update(findings, version);
    this.timeline.recordDiff(diff, version);
    this.suppressedDuplicates += diff.suppressedDuplicates;
    this.briefingCache = undefined; // findings may have changed
    this.rebuildInsights();
  }

  private rebuildInsights(): void {
    const hubs = new Set(this.graphSource.query().topology().hubs);
    const ctx: PriorityContext = { hubs, recentlyTouched: this.recentlyTouched };
    this.insights = prioritize(buildInsights(this.repository.active(), this.domain), ctx);
    this.emit();
  }

  // ── Feed & queries ────────────────────────────────────────────────────────

  getFeed(filter: FeedFilter = {}): readonly Insight[] {
    let list = this.insights as readonly Insight[];
    if (filter.severity) list = list.filter((i) => i.severity === filter.severity);
    if (filter.category) list = list.filter((i) => i.category === filter.category);
    if (filter.type) list = list.filter((i) => i.type === filter.type);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((i) => `${i.title} ${i.summary} ${i.recommendation}`.toLowerCase().includes(q));
    }
    return list;
  }

  priorityQueue(n = 5): readonly Insight[] {
    return this.insights.slice(0, n);
  }

  suggestedNextActions(n = 5): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const insight of this.insights) {
      const action = insight.recommendation.trim();
      const key = action.toLowerCase();
      if (action && !seen.has(key)) {
        seen.add(key);
        out.push(action);
        if (out.length >= n) break;
      }
    }
    return out;
  }

  getInsight(id: string): Insight | undefined {
    return this.insights.find((i) => i.id === id);
  }

  timelineEvents(n = 20): readonly TimelineEvent[] {
    return this.timeline.recent(n);
  }

  stats(): RepositoryStats {
    return this.repository.stats();
  }

  snapshot(): IntelligenceSnapshot {
    return {
      insights: this.insights,
      stats: this.repository.stats(),
      timeline: this.timeline.recent(20),
      version: this.lastVersion,
      degradedAnalysis: this.degradedAnalysis,
    };
  }

  // ── Lifecycle actions ─────────────────────────────────────────────────────

  /** User marks an insight fixed (resurfaces as recurring if still detected). */
  resolve(insightId: string): void {
    const insight = this.getInsight(insightId);
    if (!insight) return;
    this.repository.markResolved(insight.findingIds);
    this.resolvedByUser += 1;
    this.timeline.record('resolved', { version: this.lastVersion, title: insight.title, insightId });
    this.rebuildInsights();
  }

  /** User hides an insight (suppressed even if it recurs). */
  dismiss(insightId: string): void {
    const insight = this.getInsight(insightId);
    if (!insight) return;
    this.repository.dismiss(insight.findingIds);
    this.dismissedCount += 1;
    this.timeline.record('dismissed', { version: this.lastVersion, title: insight.title, insightId });
    this.rebuildInsights();
  }

  /** User accepts an insight's recommendation (acknowledged; leaves the feed). */
  accept(insightId: string): void {
    const insight = this.getInsight(insightId);
    if (!insight) return;
    this.repository.markResolved(insight.findingIds);
    this.acceptedCount += 1;
    this.timeline.record('accepted', { version: this.lastVersion, title: insight.title, insightId });
    this.rebuildInsights();
  }

  // ── Contextual suggestions & activity ─────────────────────────────────────

  /** Record the user's current selection/edit focus — feeds prioritisation. */
  noteActivity(ids: readonly string[]): void {
    if (ids.length === 0) return;
    let changed = false;
    for (const id of ids) {
      if (!this.recentlyTouched.has(id)) {
        this.recentlyTouched.add(id);
        changed = true;
      }
    }
    if (changed) this.rebuildInsights(); // cheap re-prioritise
  }

  /** Suggest what to do about the current selection (not overwhelming). */
  contextualSuggestions(ids: readonly string[]): ContextualSuggestions {
    const set = new Set(ids);
    const related = this.insights.filter((i) => i.affectedEntities.some((e) => set.has(e))).slice(0, 4);
    const actions: SuggestedAction[] = [];
    if (ids.length > 0) {
      actions.push({ kind: 'explain', label: 'Explain the selection', targetIds: ids });
      actions.push({ kind: 'review', label: 'Review the selection', targetIds: ids });
    }
    for (const insight of related.slice(0, 2)) {
      actions.push({ kind: 'improve', label: insight.recommendation, insightId: insight.id, targetIds: insight.affectedEntities });
    }
    return { insights: related, actions: actions.slice(0, 4) };
  }

  // ── LLM briefing (reasoning) ──────────────────────────────────────────────

  async generateBriefing(observer: { onToken?(d: string): void } = {}, signal?: AbortSignal): Promise<BriefingResult> {
    if (this.briefingCache && this.briefingCache.version === this.lastVersion) {
      return { ...this.briefingCache.result, cached: true };
    }
    const stats = this.repository.stats();

    // No insights, or no LLM → deterministic briefing.
    if (this.insights.length === 0 || !this.service) {
      const { briefing, insights } = formatBriefing(this.insights, stats, undefined, !this.service && this.insights.length > 0);
      const result: BriefingResult = { briefing, insights, usage: ZERO_USAGE, cached: false, degraded: briefing.degraded };
      this.briefingCache = { version: this.lastVersion, result };
      return result;
    }

    const query = this.graphSource.query();
    const view = buildBriefingContext(query, this.insights, stats);
    let explanation: InsightBriefing | undefined;
    let usage: TokenUsage = ZERO_USAGE;
    let degraded = false;
    try {
      const t0 = this.timer();
      const outcome = await this.runLLM(view.block, signal, observer);
      explanation = outcome.explanation;
      usage = outcome.usage;
      this.lastBriefingMs = this.timer() - t0;
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      degraded = true; // graceful degradation
    }

    const { briefing, insights } = formatBriefing(this.insights, stats, explanation, degraded);
    const result: BriefingResult = { briefing, insights, usage, cached: false, degraded };
    this.briefingCache = { version: this.lastVersion, result };
    return result;
  }

  /** A deterministic, always-available explanation for a single insight. */
  explainInsight(insightId: string): string {
    const insight = this.getInsight(insightId);
    if (!insight) return 'Unknown insight.';
    if (insight.observation) return insight.observation;
    const evidence = insight.findings[0]?.evidence[0];
    return [insight.summary, evidence ? `Why: ${evidence}` : '', `Recommendation: ${insight.recommendation}`].filter(Boolean).join(' ');
  }

  metrics(): IntelligenceMetrics {
    return {
      activeInsights: this.insights.length,
      suppressedDuplicates: this.suppressedDuplicates,
      dismissed: this.dismissedCount,
      accepted: this.acceptedCount,
      resolvedByUser: this.resolvedByUser,
      lastAnalysisMs: this.lastAnalysisMs,
      lastBriefingMs: this.lastBriefingMs,
      timelineEvents: this.timeline.all().length,
    };
  }

  // ── Events & teardown ─────────────────────────────────────────────────────

  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.detach?.();
    this.detach = undefined;
    this.listeners.clear();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private emit(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const l of this.listeners) l(snapshot);
  }

  private async runLLM(block: string, signal: AbortSignal | undefined, observer: { onToken?(d: string): void }): Promise<{ explanation: InsightBriefing; usage: TokenUsage }> {
    const variables = insightPromptVariables(this.domain);
    let correction: string | undefined;
    let usage: TokenUsage = ZERO_USAGE;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (signal?.aborted) throw new CancelledError();
      const messages = this.promptBuilder.build({ template: { id: INSIGHT_PROMPT_ID }, user: buildBriefingUserPrompt(correction), contextBlock: block, variables });
      const completion = await this.runModel(messages, signal, observer);
      usage = completion.usage;
      const parsed = this.validator.validate(completion.text, InsightBriefingSchema, { minConfidence: this.service!.config.validation.minConfidence });
      if (parsed.ok) return { explanation: parsed.value, usage };
      correction = parsed.issues.map((i) => `- ${i.path ?? '<root>'}: ${i.message}`).join('\n');
    }
    throw new Error('invalid briefing');
  }

  private async runModel(messages: readonly ChatMessage[], signal: AbortSignal | undefined, observer: { onToken?(d: string): void }): Promise<{ text: string; usage: TokenUsage }> {
    const opts = { signal, tier: 'reasoning' as const, intent: 'insight' };
    if (!this.streamByDefault) {
      const response = await this.service!.complete({ messages, responseFormat: { type: 'json' } }, opts);
      observer.onToken?.(response.text);
      return { text: response.text, usage: response.usage };
    }
    let text = '';
    let usage: TokenUsage = ZERO_USAGE;
    for await (const chunk of this.service!.stream({ messages, responseFormat: { type: 'json' } }, opts)) {
      if (chunk.delta) {
        text += chunk.delta;
        observer.onToken?.(chunk.delta);
      }
      if (chunk.usage) usage = chunk.usage;
    }
    return { text, usage };
  }
}
