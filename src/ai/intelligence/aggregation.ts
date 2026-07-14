/**
 * Aggregation — turn deterministic findings into merged, deduplicated insights.
 *
 * Findings are grouped by the **rule** that produced them: N single-points-of-
 * failure become one "Availability" insight over N nodes, rather than N feed
 * lines. This is the "merge related / suppress duplicates" step at the insight
 * layer (the repository already deduplicates identical findings across versions).
 * Grouping is pure and deterministic; the strategy is intentionally simple and
 * swappable. Priority is assigned separately by {@link ./prioritization}.
 */

import type { ExplanationDomain } from '../explain';
import { compareFindings, severityRank, type Finding, type ReviewCategory, type Severity } from '../review';
import type { Insight } from './model/Insight';
import { insightTypeFor } from './model/Insight';
import type { RepositoryEntry } from './FindingRepository';

/** An insight before priority + status are attached. */
export type InsightDraft = Omit<Insight, 'priority' | 'status' | 'observation'>;

/** Build merged insight drafts from the active findings. Deterministic. */
export function buildInsights(active: readonly RepositoryEntry[], domain: ExplanationDomain): InsightDraft[] {
  const groups = new Map<string, RepositoryEntry[]>();
  for (const entry of active) {
    const ruleId = entry.finding.ruleId;
    const bucket = groups.get(ruleId) ?? [];
    bucket.push(entry);
    groups.set(ruleId, bucket);
  }

  const drafts: InsightDraft[] = [];
  for (const [ruleId, entries] of groups) {
    const findings = entries.map((e) => e.finding).sort(compareFindings);
    const severity = mostSevere(findings);
    const confidence = Math.max(...findings.map((f) => f.confidence));
    const seenCount = Math.max(...entries.map((e) => e.seenCount));
    const createdAt = Math.min(...entries.map((e) => e.firstSeenVersion));
    const category = findings[0]!.category as ReviewCategory;
    const affected = [...new Set(findings.flatMap((f) => f.affectedEntities))];

    drafts.push({
      id: `insight:${ruleId}`,
      type: insightTypeFor(findings[0]!, domain),
      title: groupTitle(findings),
      summary: groupSummary(findings),
      severity,
      confidence,
      category,
      recommendation: findings[0]!.recommendation,
      findingIds: findings.map((f) => f.id),
      findings,
      affectedEntities: affected,
      seenCount,
      createdAt,
    });
  }
  return drafts;
}

function mostSevere(findings: readonly Finding[]): Severity {
  return findings.reduce((best, f) => (severityRank(f.severity) < severityRank(best) ? f.severity : best), findings[0]!.severity);
}

function groupTitle(findings: readonly Finding[]): string {
  if (findings.length === 1) return findings[0]!.title;
  const base = findings[0]!.title.split(':')[0]!.trim();
  return `${base} (${findings.length})`;
}

function groupSummary(findings: readonly Finding[]): string {
  if (findings.length === 1) return findings[0]!.message;
  return `${findings.length} occurrences. e.g. ${findings[0]!.message}`;
}
