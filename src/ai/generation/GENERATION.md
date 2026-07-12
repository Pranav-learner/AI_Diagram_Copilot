# AI Diagram Generation — Architecture

Phase 3, Module 2. The first AI **capability**, built on the P3M1 AI Foundation.
Users describe a diagram in natural language; the application reliably turns that
intent into a polished, editable diagram through a safe, validated pipeline.

> **The core invariant:** the LLM only ever produces a **semantic DiagramPlan**.
> It never emits coordinates, shapes, colours, DSL, or runtime operations. The
> application owns validation, layout, operations, execution, and rendering.

Import everything from `@/ai` (the generation module is re-exported there).

---

## 1. The pipeline (every stage isolated)

```
User prompt
   │
   ▼  IntentAnalyzer            (P3M1) — "generate" (when routed via AIPipeline)
   ▼  ContextBuilder            (P3M1) — existing-diagram context (regeneration)
   ▼  PromptBuilder             (P3M1) — versioned generation template + few-shot
   ▼  AIService  → LLM          (P3M1) — streamed completion
   ▼  DiagramPlan               semantic JSON (NO coordinates)
   ▼  ResponseValidator         (P3M1) zod schema + confidence gate
   ▼  validatePlan              semantic coherence (dupes, dangling refs, …)
   ▼  ExecutionPlanner          ← owns ALL runtime operations
   │     └─ LayoutEngine        ← app computes positions (dagre + custom)
   ▼  OperationPlan             { type, params }[]  (runtime registry contract)
   ▼  DiagramGateway (port)     validate op types → apply atomically
   ▼  DiagramRuntime            one undoable transaction
   ▼  Canvas                    rendered via the bridge (origin 'program')
```

Two entry points, **one** conversion path (`ExecutionPlanner`):

- **`DiagramGenerator`** — the UI's front door. Adds streaming, **staged
  progress**, cancellation, retry, regenerate, and self-healing.
- **`GenerationHandler`** — an `IntentHandler` plugged into the generic
  `AIPipeline`, proving the P3M1 extensibility thesis (intent + prompt + schema +
  `toOperations`, nothing else).

---

## 2. The DiagramPlan (`model/DiagramPlan.ts`)

A strongly-typed, **semantic** contract — the schema is the source of truth; the
TS types are `z.infer`'d from it so validation and typing never drift.

| Section | Purpose |
|---|---|
| `diagramType` | one of the 11 supported types (registry-backed) |
| `title` / `description` | naming + document metadata |
| `layout` | *suggested* layout hint (the app resolves + computes actual positions) |
| `nodes` | `{ id, label, type (semantic role), description?, group?, parent? }` |
| `relationships` | `{ source, target, label?, type?, direction? }` (ids reference nodes) |
| `groups` | `{ id, label, nodeIds }` |
| `annotations` | `{ text, target? }` → rendered as text nodes |
| `styling` | hints only (theme, emphasize) — the app maps to concrete styles |
| `confidence` | model self-report, gated by the validator |

**No coordinates. No shapes. No colours. No renderer fields.** Cross-references
use LLM-chosen stable ids; the ExecutionPlanner maps them to minted DSL ids.

---

## 3. Validation (never trust the model)

Two gates, both before any runtime mutation:

1. **Schema** (`ResponseValidator` + `DiagramPlanSchema`) — shape, enums,
   required fields, confidence floor, tolerant JSON extraction (fences/prose).
2. **Semantic** (`validatePlan`) — duplicate node ids, relationships/groups/
   annotations referencing unknown nodes, empty diagrams, unknown diagram types.
   Errors **reject**; warnings (e.g. a disconnected multi-node diagram) are
   surfaced but non-fatal.

A rejected plan never reaches the runtime. On failure the generator **self-heals**
once: it re-prompts with the validation feedback appended (bounded by
`maxPlanAttempts`).

---

## 4. Execution planning (`ExecutionPlanner.ts`) — the app owns operations

`DiagramPlan` + computed layout → `OperationPlan` (`{ type, params }[]`):

- **Nodes** → `node.create` with app-chosen `shape` (from semantic role),
  `size`, `style`, and the **layout-computed position**.
- **Relationships** → `edge.connect` with arrowheads/routing from direction +
  layout kind.
- **Groups** → `group.create` (after member nodes exist).
- **Annotations** → `node.create` (text) near their target.
- **Metadata** → `document.metadata` (diagramType, generatedBy, …).

Plan ids map to freshly-minted DSL ids so edges reference the created nodes
coherently. The plan is **atomic** → one undoable transaction. Two layers of op
validation: the planner checks types against the gateway's known operations, then
the runtime validates every operation before it mutates the DSL.

---

## 5. Layout strategy (`layout/`) — the app computes positions

The LLM describes **relationships and hierarchy**; the `LayoutEngine` computes
**positions**. A registry of `LayoutKind → LayoutAlgorithm`:

| Kind | Engine | Used by |
|---|---|---|
| `layered` | **dagre** (Sugiyama ranking) | flowchart, architecture, ERD, class, state |
| `tree` | dagre (tighter) | org-chart, decision-tree |
| `radial` | custom (BFS rings) | network |
| `mindmap` | custom (two-sided tidy tree) | mind map |
| `grid` | custom (√n grid) | fallback |
| `linear` | custom (ordered row) | sequence, timeline |

Each `DiagramTypeDefinition` names a default layout + direction; a plan's `layout`
hint overrides. Unknown kinds fall back (never dead-end). Algorithms are pure
geometry — no DSL, no renderer. **Adding a layout = implement `LayoutAlgorithm` +
`register()`.**

---

## 6. Prompt strategy (`prompts/generationPrompts.ts`)

Centralized and **versioned** (`diagram.generate@v1`). Separated channels:
**system** (identity + the DiagramPlan contract + hard rules: semantic only, no
coordinates/shapes/colours, stable kebab ids), **developer** (strict JSON-only
output), and a compact **few-shot** anchoring the JSON shape. The user turn is
composed by `buildGenerationUserPrompt` (raw prompt + optional type hint +
regenerate/self-correction feedback). Nothing is hardcoded at call sites.

---

## 7. Generation experience (`DiagramGenerator` + `useDiagramGeneration`)

Staged progress (not a spinner):

```
✓ Understanding request   ✓ Building plan       ✓ Validating plan
✓ Computing layout        ✓ Creating diagram    ✓ Rendering canvas
```

- **Streaming** — plan tokens stream to the observer.
- **Cancellation** — an `AbortSignal` threaded through the service; a cancel
  before the executing stage never touches the runtime.
- **Retry / Regenerate** — `retry()` re-runs the last prompt; `regenerate()`
  undoes the prior generation (one atomic transaction) and asks for a variation.
- **Clear errors** — `AIError` subtypes mapped to friendly messages.

The React panel (`src/features/ai/`) overlays the canvas, collapsible, with a
prompt box, a diagram-type selector, and the live progress checklist. It reaches
the runtime through `createRuntimeGateway` (the one app-side bridge between the
`@/ai` ports and `DiagramRuntime`).

**Providers:** `createEditorAIService` uses a real provider when a key is set
(`VITE_ANTHROPIC_API_KEY` / `VITE_OPENAI_API_KEY`), else the heuristic
`MockPlanProvider` (a real provider that emits a valid plan — the feature works
with zero config). Browser CORS means production routes real vendors through a
backend proxy (a `baseURL` override — config, not code).

---

## 8. Extending

- **New diagram type:** `diagramTypeRegistry.register({ type, label, defaultLayout,
  direction, roles })` + (optionally) a new layout. No planner/generator changes.
- **New layout:** implement `LayoutAlgorithm`, `layoutEngine.register(algo)`.
- **New provider:** register any `AIProvider` (P3M1) — the generation stack is
  provider-agnostic.
- **New prompt version:** register `diagram.generate@v2`; A/B via config.

---

## 9. A bridge fix this module surfaced

Generation is a rapid **program render right after canvas mount** — a code path
manual editing rarely hit. It exposed a latent bug in the canvas⇄DSL bridge: the
coalescing `flush()` parsed a **stale scene snapshot** (the empty initial-mount
onChange) instead of the live canvas, wiping freshly-generated nodes on some
runs. Fixed in `CanvasBridgeImpl.flush()` — it now reconciles the *live* scene
(`port.getScene()`), the correct coalescing semantic. Guarded by
`__tests__/live/stale-scene.test.ts` (fails without the fix). Verified in-browser:
generated diagrams persist and survive reload deterministically.

---

## 10. How this prepares for Conversational Editing (next module)

The seams are already in place:

- **Semantic plan → validate → ExecutionPlanner → gateway** is reusable: editing
  produces an *EditPlan* (add/remove/reconnect/restyle) that compiles to the same
  `OperationPlan` via the same runtime registry. The `ContextBuilder` already
  feeds the current diagram to the model; edits will target existing DSL ids.
- **Intent routing** is live: `edit` already classifies; a future `EditHandler`
  registers exactly like `GenerationHandler` (intent + prompt + schema +
  `toOperations`) with no pipeline changes.
- **Atomic, undoable operations** mean every AI edit is one undo away, and the
  bridge round-trip (now robust) keeps the DSL and canvas in sync.
- **Layout** can run incrementally (re-layout only affected subgraphs) behind the
  same `LayoutEngine` interface.

Generation proved the full path end-to-end; conversational editing reuses it,
swapping "build a whole diagram" for "describe a change."
