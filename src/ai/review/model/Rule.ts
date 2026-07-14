/**
 * The pluggable rule engine contract.
 *
 * A {@link ReviewRule} is a small, independently-testable unit of static analysis
 * over the Semantic Graph — the diagram analogue of an ESLint rule. It declares
 * metadata (id, category, severity, which domains it applies to, a recommendation)
 * and a pure {@link ReviewRule.evaluate} that returns zero or more
 * {@link RuleFinding}s. The engine composes each raw finding into a full
 * {@link Finding} (filling id, ruleId, title, defaults), so rules stay terse.
 * Adding a capability = adding a rule; nothing else changes.
 */

import type { SemanticEntity, SemanticGraph, SemanticQuery } from '../../understanding';
import type { ExplanationDomain } from '../../explain';
import type { Finding, ReviewCategory, Severity } from './Finding';

/** The read-only context handed to every rule. Rules never mutate anything. */
export interface RuleContext {
  readonly graph: SemanticGraph;
  readonly query: SemanticQuery;
  /** The detected (or requested) diagram domain. */
  readonly domain: ExplanationDomain;
  /** Entity ids under review (all of them for a whole-diagram review). */
  readonly scope: ReadonlySet<string>;
  /** True when reviewing the whole diagram (vs. a selection/subgraph). */
  readonly whole: boolean;
  /** Entities under review, resolved. */
  scopedEntities(): readonly SemanticEntity[];
  /** In-scope entities of a given kind. */
  byKind(kind: string): readonly SemanticEntity[];
  /** Is an id part of the reviewed scope? */
  inScope(id: string): boolean;
}

/**
 * The per-occurrence payload a rule returns. The engine fills the rest from the
 * rule's metadata, so a rule only describes what it found.
 */
export interface RuleFinding {
  /** Ids this finding is about (used for the finding id + highlighting). */
  readonly affectedEntities?: readonly string[];
  readonly message: string;
  readonly evidence?: readonly string[];
  /** Override the rule's default severity for this occurrence. */
  readonly severity?: Severity;
  /** Override the rule's default confidence (default 0.9 for structural rules). */
  readonly confidence?: number;
  /** Override the rule's default recommendation. */
  readonly recommendation?: string;
  /** Override the rule's default title. */
  readonly title?: string;
  readonly metadata?: Record<string, string | number | boolean>;
  /** Discriminator to keep the finding id unique when a rule fires many times. */
  readonly key?: string;
}

export interface ReviewRule {
  readonly id: string;
  readonly category: ReviewCategory;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string;
  /**
   * Domains this rule applies to. Omit (or empty) = universal (runs everywhere).
   * The registry filters by the reviewed domain.
   */
  readonly domains?: readonly ExplanationDomain[];
  /** Deterministic detection. Must be pure and side-effect free. */
  evaluate(ctx: RuleContext): readonly RuleFinding[];
}

/** Compose a full {@link Finding} from a rule + its raw finding. */
export function composeFinding(rule: ReviewRule, raw: RuleFinding): Finding {
  const affected = raw.affectedEntities ?? [];
  const idSuffix = raw.key ?? (affected.length > 0 ? affected.join(',') : '');
  return {
    id: idSuffix ? `${rule.id}#${idSuffix}` : rule.id,
    ruleId: rule.id,
    category: rule.category,
    severity: raw.severity ?? rule.severity,
    confidence: raw.confidence ?? 0.9,
    title: raw.title ?? rule.title,
    message: raw.message,
    affectedEntities: affected,
    evidence: raw.evidence ?? [],
    recommendation: raw.recommendation ?? rule.recommendation,
    ...(raw.metadata ? { metadata: raw.metadata } : {}),
  };
}

/** A registry of rules, filterable by the reviewed domain. */
export class RuleRegistry {
  private readonly byId = new Map<string, ReviewRule>();

  register(rule: ReviewRule): this {
    this.byId.set(rule.id, rule);
    return this;
  }

  registerAll(rules: Iterable<ReviewRule>): this {
    for (const rule of rules) this.register(rule);
    return this;
  }

  get(id: string): ReviewRule | undefined {
    return this.byId.get(id);
  }

  all(): readonly ReviewRule[] {
    return [...this.byId.values()];
  }

  /** Rules that apply to `domain`: universal rules + those listing the domain. */
  forDomain(domain: ExplanationDomain): readonly ReviewRule[] {
    return this.all().filter((r) => !r.domains || r.domains.length === 0 || r.domains.includes(domain));
  }
}
