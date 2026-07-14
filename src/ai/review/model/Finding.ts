/**
 * The Finding model — the atomic, traceable output of Diagram Review.
 *
 * A Finding is discovered by the **application** (a deterministic rule over the
 * Semantic Graph), never by the LLM. It is strongly typed and fully traceable:
 * every finding names the rule that produced it, the entities it affects, and the
 * concrete evidence behind it, so a user can always answer "why is this flagged?".
 * The LLM later attaches prose to a finding by id — it does not create findings.
 */

/** Severity, from most to least urgent. Drives ordering, scoring, and colour. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Ordered most-severe first; used for ranking and rank math. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** 0 = critical … 4 = info. Lower is more severe. */
export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

/**
 * The concern a finding speaks to. Categories map onto scoring dimensions and let
 * the UI group findings. Open-ended for future domains.
 */
export type ReviewCategory =
  | 'reliability'
  | 'availability'
  | 'security'
  | 'scalability'
  | 'performance'
  | 'maintainability'
  | 'coupling'
  | 'structure'
  | 'observability'
  | 'process'
  | 'correctness'
  | 'best-practice'
  | (string & {});

export interface Finding {
  /** Stable, deterministic id: `${ruleId}` or `${ruleId}#${key}`. */
  readonly id: string;
  /** The rule that produced this finding (traceability). */
  readonly ruleId: string;
  readonly category: ReviewCategory;
  readonly severity: Severity;
  /** 0..1 — deterministic structural rules are high; heuristics are lower. */
  readonly confidence: number;
  /** Short headline (the rule's title, possibly specialised per instance). */
  readonly title: string;
  /** Human description of *this specific* occurrence. */
  readonly message: string;
  /** Entity / group / relationship ids this finding is about (for highlighting). */
  readonly affectedEntities: readonly string[];
  /** Concrete facts that justify the finding — the "why". */
  readonly evidence: readonly string[];
  /** What to do about it (the rule's recommendation, possibly specialised). */
  readonly recommendation: string;
  /** Structured extras (counts, metrics) for the UI / downstream. */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

/** Sort findings most-severe first, then by confidence, then by category/id. */
export function compareFindings(a: Finding, b: Finding): number {
  const s = severityRank(a.severity) - severityRank(b.severity);
  if (s !== 0) return s;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  const c = String(a.category).localeCompare(String(b.category));
  return c !== 0 ? c : a.id.localeCompare(b.id);
}

/** Count findings by severity (for the scorecard + UI badges). */
export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}
