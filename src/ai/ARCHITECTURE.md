# AI Foundation — Architecture

Phase 3, Module 1. This layer is the **AI infrastructure** every future AI
capability builds on. It contains **no features** — no diagram generation,
editing, explanation, review, import, or export. It provides the plumbing those
features will share so that adding one is a small, well-shaped plug-in rather
than a new stack.

Import everything from `@/ai`. Never reach into subpaths.

---

## 1. Design mandate

> The AI layer must be independent from React, Excalidraw, the canvas, the
> Diagram DSL internals, and rendering. The AI communicates only through
> interfaces.

Consequences enforced throughout:

- **No engine import.** The AI layer imports `@/dsl` for domain **types** only
  (to read a diagram summary). It never imports `@/diagram-engine`. It talks to
  the runtime through two ports it defines itself:
  - `DiagramContextSource` (read) — how it sees the diagram.
  - `DiagramGateway` (write) — how it applies operations.
  The app wires `DiagramRuntime` to these ports. The AI layer stays swappable
  and unit-testable with no engine present.
- **Nothing bypasses the pipeline.** The LLM never touches the DSL, never emits
  runtime operations directly, and its output is never trusted. Every mutation
  flows validate → plan → runtime.
- **No magic constants.** Every tunable lives in `AIConfig`.

---

## 2. The pipeline

```
              User turn
                 │
                 ▼
          IntentAnalyzer        classify → which capability
                 │
                 ▼
          ContextBuilder        read diagram via DiagramContextSource (port)
                 │
                 ▼
          PromptBuilder         versioned templates + context + history
                 │
                 ▼
            AIService           route → AIClient(retry/timeout/cancel) → provider
                 │
                 ▼
        Structured response     raw text
                 │
                 ▼
        ResponseValidator       parse + zod schema + confidence  (never trust)
                 │
                 ▼
        IntentHandler.toOperations   high-level plan → OperationPlan
                 │
                 ▼
        OperationPlanner        validate op types, then apply
                 │
                 ▼
        DiagramGateway (port) → DiagramRuntime
```

`AIPipeline` sequences these generically. It ships with an **empty**
`HandlerRegistry` — it has no idea what "generate" or "edit" means. A capability
becomes reachable the instant its `IntentHandler` is registered.

---

## 3. Folder map

```
ai/
  core/            types, tokens, errors, config, provider contract,
                   AIClient (resilience), ModelRouter, AIService, factory
  providers/       http transport, base, ProviderRegistry,
                   Mock / Anthropic / OpenAI / Gemini / Local
  planning/        IntentAnalyzer, ContextBuilder, PromptBuilder, OperationPlanner
  validation/      ResponseValidator, schemas/ (zod structured output)
  conversation/    Conversation, ConversationManager
  observability/   Logger, LatencyTracker, TokenTracker, AIMetrics
  pipeline/        IntentHandler (plug-in contract), AIPipeline (orchestrator)
  __tests__/       full suite
```

---

## 4. Subsystems

### 4.1 Provider abstraction (`providers/`, `core/AIProvider.ts`)

A provider does **one** thing: map a normalized `ResolvedRequest` to/from a
vendor wire format, yielding a normalized `ChatResponse` / `StreamChunk` stream.
It owns **no policy** — no retries, timeouts, routing, or metrics. Those live
above it, so every provider inherits them identically.

- `AnthropicProvider` (primary, Claude), `OpenAIProvider`, `GeminiProvider`,
  `LocalProvider` (OpenAI-compatible, a thin specialization), `MockProvider`
  (deterministic, network-free — the default and the test backbone).
- Real providers call an **injected `HttpTransport`** (default: `fetch`), so
  they are fully testable without a network and swappable behind proxies.
- `ProviderRegistry` resolves a provider by id. Adding a vendor is one
  `register()` call — no change to the client, service, or callers.

### 4.2 Resilience (`core/AIClient.ts`)

Wraps a single provider with the cross-cutting reliability concerns:

- **Timeouts** — a per-attempt deadline via a linked `AbortController`.
- **Cancellation** — cooperative, through the caller's `AbortSignal`. A caller
  abort surfaces as a terminal `CancelledError`; a deadline hit surfaces as a
  retryable `TimeoutError`. The two are distinguished even though both abort.
- **Retries** — exponential backoff with full jitter, **only** for errors the
  `AIError` family marks `retryable` (transient transport failures), never for
  logic failures or cancellation. Streams are never retried (a partial stream
  can't be replayed); their timeout bounds time-to-first-chunk.
- `sleep` and `random` are injected → deterministic retry/jitter tests.

### 4.3 Service & routing (`core/AIService.ts`, `core/ModelRouter.ts`)

`AIService` is the single front door. It composes: route → resolve provider →
execute with resilience → record metrics → return normalized. It owns **model
resolution** — a tier (`default` / `fast` / `reasoning`) maps to a concrete
model + sampling defaults, overridable per request — and **observability
wiring**, so those exist once for all features. `ModelRouter` is the seam for
future cost-aware / intent-based routing; today it's a tier lookup.

### 4.4 Structured output & validation (`validation/`)

The LLM never returns free-form JSON we trust. Responses are validated with
**zod** schemas:

- `ResponseValidator` coerces raw text to JSON (tolerating markdown fences and
  surrounding prose), validates against a schema, and enforces a **confidence
  floor**. It returns a discriminated result (`ok`) or throws
  `ResponseValidationError`. Every failure is recorded to metrics.
- `schemas/common.ts` provides `planEnvelope(kind, dataSchema)` — the shared
  envelope (`kind`, `version`, `confidence`, `summary`, `data`) every feature
  wraps its payload in, inheriting versioning + confidence gating for free.
- `schemas/operationPlan.ts` is the **runtime-facing execution contract**
  (`{ type, params }[]`) — validated before anything reaches the runtime.

### 4.5 Operation planning (`planning/OperationPlanner.ts`)

The LLM emits a validated **high-level plan**; the planner compiles it into
`OperationDescriptor`s and executes them through `DiagramGateway`.

- Table-driven: a feature registers a `PlanCompiler` for its step kind.
- A `ref()` id table lets a plan create a node and connect it in the same plan
  (ids are minted up-front and passed as explicit `id` params, which the runtime
  registry supports).
- Descriptors are pre-validated against the gateway's known operation types
  (fail fast), then the runtime applies its own per-operation `validate`. Two
  layers of defense; nothing bypasses this path.

### 4.6 Context pipeline (`planning/ContextBuilder.ts`)

Turns live diagram state into compact, token-budgeted model context, read
through the `DiagramContextSource` port. Large diagrams are truncated to a node
budget **with the omission made explicit** (never silent) and rendered as a
fenced JSON block for prompt injection.

### 4.7 Prompt pipeline (`planning/PromptBuilder.ts`)

Prompts are never string-concatenated at call sites. A `PromptTemplate`
(system + developer channels, few-shot examples, a **version**) lives in
`PromptRegistry`; `PromptBuilder` assembles it with injected context and
conversation history into the final message array in a fixed order. Multiple
versions of a template coexist (A/B a `v2` without deleting `v1`).

### 4.8 Conversation (`conversation/`)

`ConversationManager` owns conversation identity, message history, **context-
window management** (`window()` selects the most recent turns that fit a token
budget, prepending any rolling summary), a **summarization hook** (`compact()`
via a pluggable `Summarizer` — the seam, not an implementation; long-term memory
is out of scope), and **streaming ingest** (`recordStream()` passes chunks
through while accumulating the assistant message).

### 4.9 Observability (`observability/`)

`AIMetrics` is the hub: latency, token usage (per model), errors (by type),
retries, validation failures, per-provider stats — one immutable
`MetricsSnapshot`. It composes `LatencyTracker` and `TokenTracker`. Cost
tracking is deferred but the per-model token breakdown is exactly the shape a
cost table will consume. `Logger` is a structured seam (silent by default).

---

## 5. Key architectural decisions

1. **Ports over engine import.** `DiagramContextSource` / `DiagramGateway` keep
   the AI layer independent and testable, and let the runtime evolve behind a
   stable interface. Wiring lives in the app, not the AI layer.
2. **Providers are pure mappings; policy lives above them.** Retries/timeouts/
   routing/metrics are written once in `AIClient`/`AIService`, so every provider
   — including future ones — is correct by construction and cheap to add.
3. **Injected transport, clock, sleep, RNG.** No hidden globals → the whole
   layer is deterministic under test and boots with zero API keys (mock
   fallback).
4. **Two-stage output handling.** The LLM emits a *high-level plan* (validated
   by schema), which the *planner* compiles to operations. The model never
   authors runtime operations, and operations are validated twice.
5. **Everything is data + registries.** Providers, prompts, plan compilers, and
   intent handlers are all registry entries. Extension = registration.

---

## 6. How this enables every future capability without architectural change

A new capability implements **exactly three things** and registers them:

| Capability | Intent | Prompt template | Response schema | `toOperations`? |
|---|---|---|---|---|
| Diagram Generation | `generate` | generation prompt | `DiagramPlan` | yes → create nodes/edges |
| Conversational Editing | `edit` | edit prompt | `EditPlan` | yes → mutate ops |
| Explain Mode | `explain` | explain prompt | `ExplanationPlan` | **no** (read-only) |
| Diagram Review | `review` | review prompt | `ReviewPlan` | **no** (read-only) |
| Smart Import | `import` | import prompt | `ImportPlan` | yes → build ops |
| Export | `export` | export prompt | `ExportPlan` | no (delegates to exporter) |

Everything else already exists and is reused unchanged: the service, provider
abstraction, retries/timeouts/cancellation, context builder, prompt assembler,
response validator, operation planner, conversation manager, metrics, config.
Read-only capabilities simply omit `toOperations`. This is verified by the
end-to-end pipeline test, which registers a test `generate` handler and drives
the full flow — analyze → prompt → complete → validate → plan → apply — with a
`MockProvider` and a fake gateway.

---

## 7. Wiring (app side, not in this module)

```ts
import { createAIService, AIPipeline, RuleBasedIntentAnalyzer } from '@/ai';
import type { DiagramGateway, DiagramContextSource } from '@/ai';
import { createDefaultOperationRegistry } from '@/diagram-engine';
import type { DiagramRuntime, OperationRegistry } from '@/diagram-engine';

// The app owns the operation registry it hands to the runtime, so it can also
// expose the type list to the gateway.
const operations: OperationRegistry = createDefaultOperationRegistry();
const runtime = new DiagramRuntime(document, { operations });

// Adapt the runtime to the AI layer's ports.
function makeGateway(runtime: DiagramRuntime): DiagramGateway {
  return {
    knownOperationTypes: () => operations.types(),
    apply: (plan) => {
      if (plan.atomic) {
        runtime.transaction(() => {
          for (const op of plan.operations) runtime.executeType(op.type, op.params);
        }, { label: plan.label });
      } else {
        for (const op of plan.operations) runtime.executeType(op.type, op.params);
      }
      return { applied: plan.operations.length, version: runtime.getVersion() };
    },
  };
}

const contextSource: DiagramContextSource = { getDocument: () => runtime.getDocument() };

const { service } = createAIService({ anthropicApiKey: process.env.ANTHROPIC_API_KEY });
const pipeline = new AIPipeline({
  service,
  intentAnalyzer: new RuleBasedIntentAnalyzer(),
  contextSource,
  gateway: makeGateway(runtime),
});
// Future modules: pipeline.handlerRegistry.register(generateHandler), etc.
```

---

## 8. Explicitly out of scope (Module boundary)

No diagram generation, conversational editing, explain, review, smart import,
export, long-term memory, or agent system. This module is **only** the
foundation. Those arrive as `IntentHandler` registrations in later modules.
