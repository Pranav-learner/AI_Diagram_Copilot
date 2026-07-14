/**
 * ReviewScorer — transparent, deterministic scoring.
 *
 * Scores are computed by the **application** from the findings and graph metrics,
 * not the LLM. Each dimension starts at 100 and loses points per finding, weighted
 * by severity and confidence; every scorecard carries a `rationale` that spells out
 * exactly how the number was reached. Which dimensions are reported adapts to the
 * domain (an architecture gets security/scalability/…; a workflow gets efficiency).
 * Strengths (positive findings) are likewise derived deterministically from the
 * graph.
 */

import type { ExplanationDomain } from '../../explain';
import type { SemanticGraph } from '../../understanding';
import type { Finding, ReviewCategory, Severity } from '../model/Finding';
import type { Grade, ReviewScores, Scorecard } from '../model/Review';

/** Points deducted per finding, before multiplying by confidence. */
const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 32, high: 20, medium: 11, low: 5, info: 1 };

interface DimensionSpec {
  readonly key: string;
  readonly label: string;
  readonly categories: readonly ReviewCategory[];
}

/** Which dimensions to report per domain (complexity + overall are always added). */
function dimensionsForDomain(domain: ExplanationDomain): DimensionSpec[] {
  const reliability: DimensionSpec = { key: 'reliability', label: 'Reliability', categories: ['reliability', 'correctness'] };
  const maintainability: DimensionSpec = { key: 'maintainability', label: 'Maintainability', categories: ['maintainability', 'structure', 'best-practice', 'observability'] };

  if (domain === 'business-workflow' || domain === 'flowchart' || domain === 'state-machine') {
    return [
      { key: 'efficiency', label: 'Process Efficiency', categories: ['process'] },
      { key: 'correctness', label: 'Correctness', categories: ['correctness', 'reliability'] },
      maintainability,
    ];
  }
  if (domain === 'education' || domain === 'mind-map') {
    return [
      { key: 'completeness', label: 'Completeness', categories: ['structure', 'correctness'] },
      { key: 'coherence', label: 'Coherence', categories: ['reliability', 'process'] },
    ];
  }
  if (domain === 'software-architecture' || domain === 'network-topology' || domain === 'system-design') {
    return [
      reliability,
      { key: 'availability', label: 'Availability', categories: ['availability'] },
      { key: 'security', label: 'Security', categories: ['security'] },
      { key: 'scalability', label: 'Scalability', categories: ['scalability', 'coupling'] },
      { key: 'performance', label: 'Performance', categories: ['performance'] },
      maintainability,
    ];
  }
  return [reliability, maintainability, { key: 'structure', label: 'Structure', categories: ['structure'] }];
}

function grade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function clampScore(n: number): number {
  return Math.max(5, Math.min(100, Math.round(n)));
}

/** Score one dimension from the findings whose category it owns. */
function scoreDimension(spec: DimensionSpec, findings: readonly Finding[]): Scorecard {
  const relevant = findings.filter((f) => spec.categories.includes(f.category));
  let penalty = 0;
  for (const f of relevant) penalty += SEVERITY_WEIGHT[f.severity] * f.confidence;
  const score = clampScore(100 - penalty);
  const rationale =
    relevant.length === 0
      ? 'No issues found in this dimension — full marks.'
      : `Started at 100; −${Math.round(penalty)} from ${relevant.length} finding(s) ` +
        `(${summarizeSeverities(relevant)}). Largest: "${relevant[0]!.title}".`;
  return { key: spec.key, label: spec.label, score, grade: grade(score), rationale };
}

function summarizeSeverities(findings: readonly Finding[]): string {
  const counts = new Map<Severity, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return [...counts].map(([s, n]) => `${n} ${s}`).join(', ');
}

/** Complexity from graph metrics (higher structural complexity ⇒ lower score). */
function scoreComplexity(graph: SemanticGraph): Scorecard {
  const n = graph.entities.size;
  const e = graph.relationships.size;
  const avgDegree = n === 0 ? 0 : (2 * e) / n;
  let penalty = 0;
  const reasons: string[] = [];
  if (graph.stats.hasCycles) {
    penalty += 15;
    reasons.push('contains cycles (−15)');
  }
  const densityPenalty = Math.min(30, Math.max(0, (avgDegree - 2) * 8));
  if (densityPenalty > 0) {
    penalty += densityPenalty;
    reasons.push(`high connectivity, avg degree ${avgDegree.toFixed(1)} (−${Math.round(densityPenalty)})`);
  }
  const sizePenalty = Math.min(20, Math.max(0, (n - 20) * 0.5));
  if (sizePenalty > 0) {
    penalty += sizePenalty;
    reasons.push(`${n} elements (−${Math.round(sizePenalty)})`);
  }
  const score = clampScore(100 - penalty);
  const rationale = reasons.length === 0 ? 'Low structural complexity — easy to reason about.' : `Started at 100; ${reasons.join(', ')}.`;
  return { key: 'complexity', label: 'Simplicity', score, grade: grade(score), rationale };
}

/** Compute the full, transparent scorecard set for a review. */
export function computeScores(findings: readonly Finding[], graph: SemanticGraph, domain: ExplanationDomain): ReviewScores {
  const specs = dimensionsForDomain(domain);
  const dims = specs.map((spec) => scoreDimension(spec, findings));
  const complexity = scoreComplexity(graph);
  const dimensions = [...dims, complexity];

  // Overall: 80% quality dimensions, 20% simplicity.
  const qualityMean = dims.length === 0 ? 100 : dims.reduce((sum, d) => sum + d.score, 0) / dims.length;
  const overallScore = clampScore(qualityMean * 0.8 + complexity.score * 0.2);
  const overallLabel =
    domain === 'software-architecture' || domain === 'network-topology' || domain === 'system-design'
      ? 'Architecture Score'
      : 'Overall Score';
  const overall: Scorecard = {
    key: 'overall',
    label: overallLabel,
    score: overallScore,
    grade: grade(overallScore),
    rationale: `Weighted mean of ${dims.length} quality dimension(s) (80%) and simplicity (20%). ${lowest(dims)}`,
  };

  return { overall, dimensions };
}

function lowest(dims: readonly Scorecard[]): string {
  if (dims.length === 0) return '';
  const min = dims.reduce((a, b) => (b.score < a.score ? b : a));
  return `Weakest dimension: ${min.label} (${min.score}).`;
}

// ── Strengths (positive findings) ─────────────────────────────────────────────

/** Derive positive observations deterministically from the graph. */
export function deriveStrengths(graph: SemanticGraph, domain: ExplanationDomain): string[] {
  const strengths: string[] = [];
  const has = (re: RegExp) => [...graph.entities.values()].some((e) => re.test(e.label) || re.test(e.kind));
  const kindPresent = (kind: string) => graph.index.byKind(kind).length > 0;

  if (graph.entities.size === 0) return strengths;
  if (!graph.stats.hasCycles && graph.entities.size > 2) strengths.push('No circular dependencies — the structure is acyclic.');
  if (graph.stats.componentCount === 1 && graph.entities.size > 1) strengths.push('The diagram is fully connected with no orphaned elements.');
  if (graph.groups.size > 0) strengths.push(`Organised into ${graph.groups.size} group(s) for clear separation of concerns.`);

  if (domain === 'software-architecture' || domain === 'network-topology' || domain === 'system-design') {
    if (kindPresent('cache') || has(/\b(cache|redis)\b/i)) strengths.push('Includes a caching layer for performance.');
    if (kindPresent('gateway') || kindPresent('loadBalancer')) strengths.push('Traffic is fronted by a gateway / load balancer.');
    if (has(/\b(auth|identity|iam|oauth)\b/i)) strengths.push('Has a dedicated authentication/authorization boundary.');
    if (has(/\b(monitor|logging|log|metric|observ|tracing|prometheus|grafana)/i)) strengths.push('Observability tooling is present.');
    if (kindPresent('queue')) strengths.push('Uses a message queue to decouple components.');
  }
  if (domain === 'business-workflow' || domain === 'flowchart') {
    if (kindPresent('start') && kindPresent('end')) strengths.push('The process has a clear start and end.');
    if (kindPresent('decision')) strengths.push('The process includes decision / validation points.');
  }
  return strengths.slice(0, 6);
}
