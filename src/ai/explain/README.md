# Explain Mode

**Phase 4 · Module 2** — an intelligent, contextual explanation system. Click any
node, relationship, group, path, or selection and get a mentor-grade explanation
that adapts to the element, its surroundings, the diagram's domain, the audience,
and the depth you want.

Explain Mode is the **first consumer of the Semantic Graph**. It reasons *only*
over the Understanding Engine's IR and Context View — never the raw Diagram DSL or
any renderer detail.

```
Click / selection / question
        ↓
Explanation Planner        (target · depth · audience · domain · scope)
        ↓
Semantic Graph  →  Context View     (Understanding Engine — compact, budgeted)
        ↓
Prompt Builder  →  LLM  →  Validator     (structured Explanation, self-heal retry)
        ↓
Formatter                  (markdown + graph-derived related elements + questions)
        ↓
UI                         (per-turn ExplanationView in the copilot sidebar)
```

Every stage is independent and separately testable.

---

## Quick start

```ts
import { ExplainEngine, UnderstandingEngine } from '@/ai';

const understanding = UnderstandingEngine.attach(runtimeChangeSource); // Phase 4 M1
const explain = new ExplainEngine({ service, graphSource: understanding });

// Explain one node, adapted for a beginner.
const { explanation } = await explain.explain({
  target: { kind: 'node', id: gatewayId },
  audience: 'beginner',
});
explanation.markdown;            // rendered prose
explanation.relatedElements;     // graph-derived "explore next" chips
explanation.suggestedQuestions;  // graph-aware follow-ups

// Ask a follow-up, scoped to the same target + context.
await explain.followUp(result.session, 'Compare this with a message queue.');
```

In the app, the copilot sidebar wires this up: the composer's **Explain** button
explains the current selection (or the whole diagram), typed "explain…" prompts
route here via the intent analyzer, related-element chips re-target the engine, and
suggested questions call `followUp`.

---

## Architecture

```
src/ai/explain/
├── model/
│   ├── ExplainTypes.ts    ExplainTarget, depth/audience/style/domain, ExplanationRequest, FormattedExplanation
│   └── Explanation.ts      the zod schema for the LLM's structured output (prose only)
├── domain.ts               detectDomain() — infer diagram family from the graph
├── ExplanationPlanner.ts   raw input → fully-specified ExplanationRequest (+ ContextScope)
├── ContextView.ts          buildExplainContext() — minimal, token-bounded prompt context
├── relatedElements.ts      deriveRelatedElements() + suggestFollowUpQuestions() (from the graph)
├── prompts/explainPrompts.ts   versioned template + audience/style/domain directives
├── format.ts               formatExplanation() — prose + related + questions → markdown
├── MockExplainProvider.ts  heuristic, network-free provider (no key / deterministic tests)
├── ExplainEngine.ts        the orchestrator: plan → context → LLM → validate → format, + cache + follow-ups
├── errors.ts               ExplainError (phase-tagged)
└── __tests__/              35 tests: domain, planner, context, related, format, mock, engine
```

### Why the interactive engine, not a pipeline handler

Editing ships both an interactive `DiagramEditor` and a generic-pipeline
`EditHandler`. Explain Mode ships **only** the interactive `ExplainEngine`, on
purpose: the generic `AIPipeline` injects context via the DSL-shaped
`ContextBuilder`, but the architecture requires Explain Mode to consume the
**Semantic Graph**. A target is also a *click* (a node/relationship/path), not just
free text, so the text→plan pipeline is the wrong shape. The engine is the correct
and only entry point — and it reads exclusively through the Understanding Engine.

---

## Supported targets

`ExplainTarget` covers every unit the spec asks for, and is open for extension:

| Target | Scope used for extraction |
| --- | --- |
| `node` | `entity` (focus + 1-hop neighbours) |
| `relationship` | `subgraph` of both endpoints |
| `group` / `container` | `group` (members) |
| `subgraph` / `selection` | `subgraph` / `selection` |
| `diagram` | `whole` |
| `path` | `path` (from → to) |
| `dependencyChain` | `subgraph` of the DEPENDENCY_KINDS-reachable set |
| `timelineSegment` | `subgraph` of the ordered ids |

The planner maps each target to a compact `ContextScope`, so the model receives a
focused slice — never the whole diagram.

## Audience, style & depth adaptation

Three orthogonal dials shape the output, injected on the prompt's developer channel:

- **Depth** — `overview` (summary + key points) or `detailed` (adds headed sections).
- **Audience** — `beginner` (define terms, analogies) · `intermediate` (concise,
  practical) · `expert` (trade-offs, failure modes, rationale; skip basics).
- **Style** — `business` (value/cost/risk) · `technical` (precise) · `educational`
  (teach with examples). Defaulted from the domain, overridable per call.

The same template yields a beginner business summary or an expert technical
deep-dive with no branching code.

## Domain adaptation

`detectDomain(graph)` infers the diagram family from entity kinds, relationship
kinds, and topology — software architecture, business workflow, network topology,
system design, mind map, ER/data model, flowchart, state machine, sequence, or
generic. The model is then told to explain *as an expert in that domain*. Detection
is pure structural inference over the Semantic Graph (there is no reliable stored
"diagram type").

## Context extraction (token discipline)

`buildExplainContext` is the token-minimisation stage. It combines:

1. a one-line **diagram digest** (orientation), and
2. the Understanding Engine's `extractContext(scope, { tokenBudget })` — a compact,
   relevance-ranked, **budgeted** slice of the local subgraph (focus + neighbours,
   relationships, groups, focus metadata),

into a single block. Truncation is explicit. The ids it touched are returned so the
explanation cache can be invalidated by region. The LLM never sees the whole diagram.

## Related elements & suggested questions

Both come from the **Semantic Graph**, not the model — so they are instant, free,
and never hallucinated (`relatedElements.ts`):

- **Related elements** — dependencies, dependents, downstream consumers, the parent
  group, relationship endpoints, or diagram hubs, each with a one-click "explain
  this" question.
- **Suggested questions** — graph-aware follow-ups: a downstream-effects question
  appears *only when the element actually has dependents*; plus alternatives,
  trade-offs, and a depth toggle.

## Interactive follow-ups

`explain()` returns an `ExplanationSession` carrying the request, the reused context
block, and the conversation so far. `followUp(session, question)` runs the model
with that same context + history, so "why?", "give an example", or "compare with
Redis" stay scoped to the target. Follow-ups are conversational and never cached.

## Caching

The engine holds a region-aware **explanation cache** (the Understanding Engine's
`RegionCache`). Each entry records the entity ids its context depended on; when the
diagram changes, the engine's `onUpdate` subscription invalidates *only* the entries
whose region intersects the change. A gateway's explanation survives an edit two
hops away but is recomputed when the gateway itself changes. Plain explanations are
cached (keyed by target + depth + audience + style + domain); free-text questions and
follow-ups are not.

## Observability

Every model call is tagged `intent: 'explain'` and flows through the shared
`AIMetrics` — latency, token usage, provider, model, retries, success/failure, and
validation failures are all captured, alongside the cache's hit/miss/eviction stats.
The turn timeline surfaces per-stage progress and streamed tokens.

## Error handling

- **Empty selection / empty diagram** → a friendly `ExplainError('planning')` before
  any model call.
- **Unknown target id** → `ExplainError('planning')`.
- **Invalid model output** → one bounded self-heal retry, then `ExplainError('validating')`.
- **Provider / network / cancellation** → the AI layer's `AIError` family
  (`CancelledError` on abort), surfaced with recovery in the UI.
- **Large context** → the extractor's token budget trims and flags truncation.

## Design decisions

- **Consumes the Semantic Graph, never the DSL.** The engine talks only to the
  Understanding Engine (`SemanticQuery`, `extractContext`) — the central guarantee.
- **The model returns prose only.** Ids, related elements, and suggested questions
  are derived deterministically from the graph, so the model can't invent structure.
- **Everything but the model call is pure and deterministic** (planner, domain,
  context, related, format), so it is cheap, cacheable, and unit-tested without a
  network.
- **Read-only throughout.** No `toOperations`, no gateway, no runtime mutation.
- **Stateless per call, scoped per session.** A fresh `SemanticQuery` per call (never
  stale), with follow-ups carrying just enough conversation to stay on-topic.

## Extending

- **A new explanation depth/style/audience** — add the literal to `ExplainTypes.ts`
  and a directive line to the prompt's guide. No pipeline change.
- **A new target kind** — add it to `ExplainTarget`, and give it a descriptor +
  scope in the planner. The rest of the pipeline is generic.
- **A new domain** — add a scoring branch to `detectDomain` and a label to
  `domainLabel`.

## How this prepares Diagram Review & AI Insights

Explain Mode establishes the exact substrate the next modules need, so they add
capability without re-plumbing:

- **The read pipeline** (plan → graph → context → prompt → validate → format) is
  reusable wholesale. Diagram Review swaps the schema (findings instead of prose)
  and the prompt; AI Insights swaps in analysis-derived observations. Both keep the
  planner, context extraction, caching, and observability.
- **`ExplanationPlanner` + `ContextView`** already turn a target into a budgeted,
  domain-aware context — Review scopes to "the whole diagram / a subsystem", Insights
  to "hubs / cycles / isolated nodes" (all already queryable via `SemanticQuery`).
- **Graph-derived related elements** are the seed of Review's "affected elements" and
  Insights' "look here" pointers — same source, richer heuristics.
- **The region-aware cache + change subscription** already keep results fresh across
  edits, which Review and Insights need identically.

Because all three read the Semantic Graph through the same query/context surface,
none of them will ever reason over the raw Diagram DSL.
