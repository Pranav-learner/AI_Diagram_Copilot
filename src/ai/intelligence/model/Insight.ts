/**
 * The Insight model — the user-facing unit of proactive intelligence.
 *
 * An {@link Insight} is a *ranked, aggregated* view of one or more deterministic
 * {@link Finding}s (grouped by the rule that produced them), classified into an
 * {@link InsightType} and carrying a transparent {@link InsightPriority}. Findings
 * are discovered by the application; insights are how the Intelligence Engine
 * surfaces them proactively — "I noticed N services are single points of failure"
 * rather than N separate lines. The optional LLM `observation` is layered on top;
 * the insight itself is fully deterministic.
 */

import type { ExplanationDomain } from '../../explain';
import type { Finding, ReviewCategory, Severity } from '../../review';

/**
 * The kind of insight, aligned with the spec's catalogue. Open (`string & {}`) so
 * future detectors (design patterns, cost) extend without an enum edit.
 */
export type InsightType =
  | 'architecture-suggestion'
  | 'performance-opportunity'
  | 'security-risk'
  | 'scalability-risk'
  | 'maintainability-improvement'
  | 'workflow-optimization'
  | 'educational-tip'
  | 'best-practice'
  | 'design-pattern'
  | 'refactoring'
  | 'cost-optimization'
  | (string & {});

export type InsightStatus = 'active' | 'resolved' | 'dismissed' | 'accepted';

/** One weighted contributor to an insight's priority, for transparency. */
export interface PriorityFactor {
  readonly label: string;
  readonly points: number;
}

export interface InsightPriority {
  readonly score: number;
  /** Plain-language explanation of *why* this insight ranked where it did. */
  readonly rationale: string;
  readonly factors: readonly PriorityFactor[];
}

export interface Insight {
  /** Stable across refreshes (`insight:<ruleId>`), so status/dismissal persists. */
  readonly id: string;
  readonly type: InsightType;
  readonly title: string;
  readonly summary: string;
  readonly severity: Severity;
  readonly confidence: number;
  readonly category: ReviewCategory;
  readonly recommendation: string;
  /** The findings merged into this insight. */
  readonly findingIds: readonly string[];
  readonly findings: readonly Finding[];
  /** Union of all affected ids, for one-click highlighting. */
  readonly affectedEntities: readonly string[];
  /** How many analyses these findings have appeared in (recurrence). */
  readonly seenCount: number;
  readonly status: InsightStatus;
  readonly priority: InsightPriority;
  /** LLM-generated proactive observation, when enriched. */
  readonly observation?: string;
  /** Version the insight was first created at. */
  readonly createdAt: number;
}

export const INSIGHT_TYPE_LABEL: Readonly<Record<string, string>> = {
  'architecture-suggestion': 'Architecture Suggestion',
  'performance-opportunity': 'Performance Opportunity',
  'security-risk': 'Security Risk',
  'scalability-risk': 'Scalability Risk',
  'maintainability-improvement': 'Maintainability',
  'workflow-optimization': 'Workflow Optimization',
  'educational-tip': 'Educational Tip',
  'best-practice': 'Best Practice',
  'design-pattern': 'Design Pattern',
  refactoring: 'Refactoring',
  'cost-optimization': 'Cost Optimization',
};

export function insightTypeLabel(type: InsightType): string {
  return INSIGHT_TYPE_LABEL[type] ?? String(type).replace(/-/g, ' ');
}

/** Category → insight type. Deterministic; a few rules get a nicer override. */
const CATEGORY_TO_TYPE: Readonly<Record<string, InsightType>> = {
  security: 'security-risk',
  availability: 'architecture-suggestion',
  reliability: 'architecture-suggestion',
  scalability: 'scalability-risk',
  coupling: 'maintainability-improvement',
  performance: 'performance-opportunity',
  maintainability: 'maintainability-improvement',
  structure: 'maintainability-improvement',
  'best-practice': 'best-practice',
  observability: 'best-practice',
  process: 'workflow-optimization',
  correctness: 'workflow-optimization',
};

const RULE_TYPE_OVERRIDE: Readonly<Record<string, InsightType>> = {
  'software/missing-cache': 'performance-opportunity',
  'software/duplicate-responsibility': 'refactoring',
  'software/poor-separation': 'refactoring',
  'software/tight-coupling': 'refactoring',
};

/** Classify a finding into an insight type, honouring the reviewed domain. */
export function insightTypeFor(finding: Finding, domain: ExplanationDomain): InsightType {
  const override = RULE_TYPE_OVERRIDE[finding.ruleId];
  if (override) return override;
  if ((domain === 'education' || domain === 'mind-map') && (finding.category === 'structure' || finding.category === 'correctness')) {
    return 'educational-tip';
  }
  return CATEGORY_TO_TYPE[finding.category] ?? 'architecture-suggestion';
}
