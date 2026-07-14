# Diagram Review

**Phase 4 · Module 3** — a professional static-analysis platform for diagrams.

The defining principle: **the application discovers issues; the AI explains them.**
A deterministic rule engine runs over the Semantic Graph and produces structured,
traceable findings and transparent scores *before* the LLM is ever called. The LLM's
only job is interpretation — explain, prioritise, weigh trade-offs, recommend. If the
model is unavailable the review still works, degraded to findings + scores. This is a
static-analysis tool (think ESLint / SonarQube for diagrams), not a prompt.

```
Semantic Graph
     ↓  StaticAnalysisEngine   ← rules discover findings (deterministic)
Findings + per-rule stats
     ↓  ReviewScorer            ← transparent scores (deterministic)
Scores + strengths
     ↓  ReviewPlanner           ← summary + findings + scores → prompt
     ↓  LLM                     ← explains findings (never invents them)
     ↓  ReviewFormatter         ← fuse; degrade gracefully if no LLM
FormattedReview → UI (scorecards, findings, highlight-on-click)
```

---

## Quick start

```ts
import { ReviewEngine, UnderstandingEngine } from '@/ai';

const understanding = UnderstandingEngine.attach(runtimeChangeSource); // Phase 4 M1
const review = new ReviewEngine({ service, graphSource: understanding });

const { review: result } = await review.review();              // whole diagram
result.scores.overall;         // { label: 'Architecture Score', score: 72, grade: 'C', rationale }
result.findings;               // prioritised, each with affectedEntities + recommendation
result.strengths;              // positive findings (from the graph)

await review.review({ scope: { kind: 'selection', ids } });     // review a selection
await review.review({ useLLM: false });                         // deterministic-only
```

In the app, the copilot sidebar's **Review** button reviews the diagram (or the
current selection); typed "review this" prompts route here; clicking a finding
highlights its affected elements on the canvas.

---

## Architecture

```
src/ai/review/
├── model/
│   ├── Finding.ts     Finding, Severity, ReviewCategory, ordering/counting helpers
│   ├── Rule.ts        ReviewRule + RuleContext + RuleFinding + RuleRegistry (+ composeFinding)
│   └── Review.ts      Scorecard/ReviewScores, ReviewExplanationSchema (LLM output), FormattedReview
├── analysis/
│   ├── graphUtils.ts          articulation points (SPOF), scoped degree, reachability
│   ├── StaticAnalysisEngine.ts runs rules → prioritized findings + timing/hit stats
│   └── rules/
│       ├── universal.ts   cycles, disconnected clusters, isolated elements (domain-aware wording)
│       ├── software.ts    SPOF, missing gateway/auth/cache, coupling, bottleneck, dead service, …
│       ├── business.ts    dead-end, missing start/end, unreachable, missing decision, duplicates
│       ├── education.ts   flat structure, knowledge gap
│       └── index.ts       defaultRuleRegistry() — the full catalogue
├── scoring/ReviewScorer.ts    computeScores() + deriveStrengths() (transparent, deterministic)
├── ReviewPlanner.ts           builds the LLM prompt context (summary + findings + scores)
├── ReviewFormatter.ts         fuse findings + LLM notes → FormattedReview (+ graceful degradation)
├── ReviewEngine.ts            orchestrator: analyze → score → plan → explain → format, + cache
├── MockReviewProvider.ts      heuristic provider (no key / deterministic tests)
├── prompts/reviewPrompts.ts   versioned template ("explain, don't rediscover")
└── __tests__/                 43 tests: each rule, engine, scoring, orchestrator, mock, large
```

---

## The rule engine

A `ReviewRule` is the diagram analogue of an ESLint rule — a small, pure,
independently-testable detector:

```ts
interface ReviewRule {
  id; category; severity; title; description; recommendation;
  domains?;                       // which domains it runs in (omit = universal)
  evaluate(ctx: RuleContext): RuleFinding[];   // deterministic detection
}
```

- **`RuleContext`** gives read-only access to the `SemanticGraph`, the `SemanticQuery`,
  the domain, and the reviewed scope (with `scopedEntities()`, `byKind()`, `inScope()`).
- A rule returns terse `RuleFinding`s (what it found); the engine's `composeFinding`
  fills in id/ruleId/title/defaults, so a full **`Finding`** is always complete and
  traceable.
- **`RuleRegistry.forDomain(domain)`** selects universal rules plus those tagged for
  the domain. `StaticAnalysisEngine` runs each in isolation (a rule that throws is
  recorded in `stats`, never crashing the review), times every rule, composes the
  findings, and **sorts them most-severe-first** — deterministically.

### Shipped rules (by domain)

| Domain | Rules |
| --- | --- |
| Universal | circular dependency / loop, disconnected clusters, isolated elements |
| Software / network / system | single point of failure (articulation points **and** non-redundant shared infra), missing gateway, missing auth, hot datastore without cache, tight coupling (bidirectional + fan-out), scalability bottleneck, dead/unreachable service, missing observability, weak separation of concerns, duplicate responsibility |
| Business / flowchart / state | dead-end activity, missing start, missing end, unreachable activity, missing approval/validation, duplicate activity |
| Education / mind-map | flat structure, knowledge gap |

Single-point-of-failure is the professional example: it combines **articulation-point**
analysis (structural chokepoints, via iterative Tarjan) with a **shared-resource**
heuristic (the only database that ≥2 components depend on) — because a leaf datastore
is a SPOF by *dependency* even though it is not an undirected cut vertex.

## The Finding model

Every finding is strongly typed and **traceable**: `id`, `ruleId`, `category`,
`severity`, `confidence`, `title`, `message`, `affectedEntities` (for highlighting),
`evidence` (the "why"), `recommendation`, and optional `metadata`. Deterministic
structural rules carry high confidence; fuzzier heuristics carry lower. The id is
stable (`ruleId#affectedIds`), so the LLM references findings without ambiguity and
the UI can focus the affected elements.

## The scoring model

Scores are computed by the **application**, transparently:

- Each dimension starts at 100 and loses `severityWeight × confidence` per relevant
  finding (critical 32, high 20, medium 11, low 5, info 1), clamped to [5, 100].
- Every `Scorecard` carries a **`rationale`** spelling out the deduction
  ("Started at 100; −40 from 3 findings …") — including for perfect dimensions.
- **Complexity** is derived from graph metrics (cycles, average degree, size), not
  findings.
- **Overall** = 80% mean of the quality dimensions + 20% simplicity, graded A–F.
- Which dimensions are reported **adapts to the domain**: an architecture gets
  security / availability / scalability / performance / reliability / maintainability;
  a workflow gets process-efficiency / correctness; a learning map gets completeness.
- **Strengths** (positive findings) are likewise derived deterministically from the
  graph (caching present, gateway/LB present, auth boundary, observability, grouping,
  acyclic, fully connected, clear start/end).

## The review pipeline & degradation

`ReviewEngine.review()` runs `analyze → score → plan → explain → format`. The LLM stage
is **optional and degrade-safe**: on provider failure, a validation failure, or
`useLLM: false`, the review keeps the deterministic findings and scores and
synthesises the summary + priority actions from the findings themselves
(`degraded: true`). A provider outage never blocks a useful review. Cancellation and
an empty diagram are the only hard errors.

## Caching & observability

- **Caching** — a region-aware `RegionCache` keyed by scope + domain + request.
  Whole-diagram reviews invalidate on any change; selection reviews invalidate only
  when their region (selection + neighbours) changes. The engine subscribes to the
  Understanding Engine's `onUpdate` to evict.
- **Observability** — every model call is tagged `intent: 'review'` and flows through
  the shared `AIMetrics` (latency, tokens, provider, retries). `AnalysisResult` adds
  per-rule timing, the rule-hit rate, and total analysis time.

## Visual feedback

Findings carry `affectedEntities`; the UI's `ReviewView` colours them by severity and,
on click, calls `copilot.focusFinding(ids)` → `bridge.setSelection(ids)` to highlight
the affected nodes/edges on the canvas.

---

## Extending

**Add a rule** — write a pure `ReviewRule` in the relevant `rules/*.ts`, list it in
`rules/index.ts`. The engine, scoring, and UI need no change. Test it in isolation:
`rule.evaluate(buildContext(graph, query, domain, scope, whole))`.

**Add a review domain** — tag rules with the new domain, add a `dimensionsForDomain`
branch in `ReviewScorer`, and (if needed) a `detectDomain` branch. Universal rules
apply automatically.

**Tune severity/scoring** — severities live on the rules/findings; dimension weights
and category→dimension mapping live in `ReviewScorer`. All transparent.

## How this prepares AI Insights & Architecture Intelligence

Diagram Review builds the substrate the next modules stand on:

- **The rule engine is the discovery layer.** AI Insights is the same machinery with a
  different lens: instead of "what's wrong", "what's notable / what's an opportunity".
  New insight detectors are just more `ReviewRule`s (or a sibling registry) over the
  same `RuleContext`.
- **Findings + scores are a structured, queryable knowledge layer.** Architecture
  Intelligence (trends, comparisons, recommendations across diagrams) consumes these
  deterministic artifacts rather than re-deriving from prose.
- **The deterministic-first, LLM-explains split** is the pattern both future modules
  reuse: cheap, reproducible, testable discovery; the model adds narrative on top.
- **Scoring dimensions + strengths** are the seed of Architecture Intelligence's
  scorecards and benchmarking.

Because discovery, scoring, and the read pipeline are all deterministic and graph-based,
Insights and Architecture Intelligence extend the platform without re-plumbing — and,
like Review, they never reason over the raw Diagram DSL.
