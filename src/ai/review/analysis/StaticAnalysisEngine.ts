/**
 * StaticAnalysisEngine — runs the rule set over the Semantic Graph and produces
 * prioritized {@link Finding}s **before** any LLM call.
 *
 * This is the core of the "application discovers, AI explains" architecture. It
 * builds the {@link RuleContext}, executes each applicable rule in isolation
 * (a rule that throws is recorded as a failed rule, never crashing the review),
 * times every rule for observability, composes raw findings into full findings,
 * and sorts them most-severe-first. The output is deterministic: the same graph +
 * scope + domain always yields the same findings in the same order.
 */

import type { ExplanationDomain } from '../../explain';
import type { SemanticEntity, SemanticGraph, SemanticQuery } from '../../understanding';
import { compareFindings, type Finding } from '../model/Finding';
import { composeFinding, type RuleContext, type RuleRegistry } from '../model/Rule';

/** Per-rule execution record for observability. */
export interface RuleStat {
  readonly ruleId: string;
  readonly durationMs: number;
  readonly findings: number;
  /** Present when the rule threw (it is skipped, not fatal). */
  readonly error?: string;
}

export interface AnalysisResult {
  readonly findings: readonly Finding[];
  readonly stats: readonly RuleStat[];
  /** Number of rules that ran. */
  readonly rulesRun: number;
  /** Number of rules that produced ≥1 finding (hit rate = hits / rulesRun). */
  readonly rulesHit: number;
  readonly totalMs: number;
}

export interface AnalyzeInput {
  readonly graph: SemanticGraph;
  readonly query: SemanticQuery;
  readonly domain: ExplanationDomain;
  /** Entity ids under review. Empty ⇒ the whole graph. */
  readonly scope?: readonly string[];
}

const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export class StaticAnalysisEngine {
  constructor(
    private readonly registry: RuleRegistry,
    private readonly now: () => number = defaultNow,
  ) {}

  analyze(input: AnalyzeInput): AnalysisResult {
    const started = this.now();
    const whole = !input.scope || input.scope.length === 0;
    const scope = new Set<string>(whole ? [...input.graph.entities.keys()] : input.scope!.filter((id) => input.graph.entities.has(id)));
    const ctx = buildContext(input.graph, input.query, input.domain, scope, whole);

    const rules = this.registry.forDomain(input.domain);
    const stats: RuleStat[] = [];
    const findings: Finding[] = [];
    let rulesHit = 0;

    for (const rule of rules) {
      const t0 = this.now();
      try {
        const raw = rule.evaluate(ctx);
        const composed = raw.map((rf) => composeFinding(rule, rf));
        if (composed.length > 0) rulesHit++;
        findings.push(...composed);
        stats.push({ ruleId: rule.id, durationMs: this.now() - t0, findings: composed.length });
      } catch (error) {
        stats.push({ ruleId: rule.id, durationMs: this.now() - t0, findings: 0, error: error instanceof Error ? error.message : String(error) });
      }
    }

    findings.sort(compareFindings);
    return { findings, stats, rulesRun: rules.length, rulesHit, totalMs: this.now() - started };
  }
}

/** Build the read-only context handed to every rule. */
export function buildContext(
  graph: SemanticGraph,
  query: SemanticQuery,
  domain: ExplanationDomain,
  scope: ReadonlySet<string>,
  whole: boolean,
): RuleContext {
  const resolve = (ids: Iterable<string>): SemanticEntity[] => {
    const out: SemanticEntity[] = [];
    for (const id of ids) {
      const e = graph.entities.get(id);
      if (e) out.push(e);
    }
    return out;
  };
  let cachedEntities: SemanticEntity[] | undefined;
  return {
    graph,
    query,
    domain,
    scope,
    whole,
    inScope: (id) => scope.has(id),
    scopedEntities: () => (cachedEntities ??= resolve(scope)),
    byKind: (kind) => graph.index.byKind(kind).filter((id) => scope.has(id)).map((id) => graph.entities.get(id)!),
  };
}
