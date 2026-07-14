/**
 * Explain Mode — the core vocabulary.
 *
 * Explain Mode reasons over the **Semantic Graph** produced by the Understanding
 * Engine, never the raw DSL. These types describe *what* to explain (the target),
 * *how* to pitch it (depth, audience, style), and the *planned request* the rest
 * of the pipeline consumes. Nothing here references a renderer, Excalidraw, or the
 * DSL — targets are semantic ids, and the planner translates them into a
 * {@link ContextScope} for the Understanding Engine to extract.
 */

import type { ContextScope } from '../../understanding';

/**
 * What the user asked to have explained. A superset of {@link ContextScope} with
 * explanation-specific targets (a single relationship, a dependency chain, an
 * ordered timeline segment). The planner maps each onto a scope for extraction.
 * Open by construction — new target kinds slot in without touching the pipeline.
 */
export type ExplainTarget =
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'relationship'; readonly id: string }
  | { readonly kind: 'group'; readonly id: string }
  | { readonly kind: 'container'; readonly id: string }
  | { readonly kind: 'subgraph'; readonly ids: readonly string[] }
  | { readonly kind: 'selection'; readonly ids: readonly string[] }
  | { readonly kind: 'diagram' }
  | { readonly kind: 'path'; readonly from: string; readonly to: string }
  | { readonly kind: 'dependencyChain'; readonly id: string }
  | { readonly kind: 'timelineSegment'; readonly ids: readonly string[] };

export type ExplainTargetKind = ExplainTarget['kind'];

/** How much to say. `overview` = a paragraph + key points; `detailed` = sections. */
export type ExplanationDepth = 'overview' | 'detailed';

/** Who is listening. Drives vocabulary and assumed prior knowledge. */
export type ExplanationAudience = 'beginner' | 'intermediate' | 'expert';

/** The register / framing of the explanation. */
export type ExplanationStyle = 'business' | 'technical' | 'educational';

/**
 * The detected subject domain, so the model explains *as* a domain expert. Open
 * (`string & {}`) so new diagram families extend without an enum edit.
 */
export type ExplanationDomain =
  | 'software-architecture'
  | 'business-workflow'
  | 'education'
  | 'network-topology'
  | 'system-design'
  | 'mind-map'
  | 'er-diagram'
  | 'sequence'
  | 'flowchart'
  | 'state-machine'
  | 'generic'
  | (string & {});

/**
 * Content facets an explanation can cover. The planner selects a relevant subset
 * (a single node leans on purpose/responsibilities/relationships; the whole
 * diagram leans on design decisions/trade-offs) so the prompt stays focused.
 */
export type ExplanationAspect =
  | 'purpose'
  | 'responsibilities'
  | 'relationships'
  | 'alternatives'
  | 'advantages'
  | 'disadvantages'
  | 'bestPractices'
  | 'commonMistakes'
  | 'designDecisions'
  | 'tradeoffs'
  | 'examples';

/**
 * The fully-planned explanation request — the output of the
 * {@link ExplanationPlanner} and the single input the context/prompt stages read.
 */
export interface ExplanationRequest {
  readonly target: ExplainTarget;
  /** The scope the Understanding Engine extracts context for. */
  readonly scope: ContextScope;
  readonly depth: ExplanationDepth;
  readonly audience: ExplanationAudience;
  readonly style: ExplanationStyle;
  readonly domain: ExplanationDomain;
  readonly aspects: readonly ExplanationAspect[];
  /** The user's free-text request or follow-up, if any (else a default framing). */
  readonly question?: string;
  /** Human label of the target, for the prompt and cache key. */
  readonly targetLabel: string;
  /** A short descriptor of what the target *is* (e.g. `cache "Redis"`). */
  readonly targetDescriptor: string;
}

/** Signals the caller passes the planner; everything not given is inferred. */
export interface ExplainInput {
  readonly target: ExplainTarget;
  readonly question?: string;
  readonly depth?: ExplanationDepth;
  readonly audience?: ExplanationAudience;
  readonly style?: ExplanationStyle;
  /** Override the auto-detected domain (rarely needed). */
  readonly domain?: ExplanationDomain;
  readonly signal?: AbortSignal;
  readonly stream?: boolean;
}

/** A graph-derived pointer to another element worth exploring next. */
export interface RelatedElement {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  /** How it relates to the target (e.g. `depends on`, `parent group`). */
  readonly relation: string;
  /** A ready-to-send follow-up that would explain it. */
  readonly question: string;
}

/** One rendered section of a detailed explanation. */
export interface ExplanationSection {
  readonly heading: string;
  readonly body: string;
}

/**
 * The final, UI-ready explanation. Combines the validated model prose with the
 * graph-derived related elements and suggested questions. Fully serializable so
 * it can live on a conversation turn.
 */
export interface FormattedExplanation {
  readonly targetLabel: string;
  readonly targetDescriptor: string;
  readonly domain: ExplanationDomain;
  readonly audience: ExplanationAudience;
  readonly style: ExplanationStyle;
  readonly depth: ExplanationDepth;
  /** One-to-three sentence gist. */
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly sections: readonly ExplanationSection[];
  /** The whole explanation rendered as a single markdown document. */
  readonly markdown: string;
  readonly relatedElements: readonly RelatedElement[];
  readonly suggestedQuestions: readonly string[];
}
