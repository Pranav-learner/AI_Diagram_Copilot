# AI Diagram Copilot

A production-grade, AI-powered diagram platform. You draw and manage diagrams in a
polished editor; the AI can **generate**, **edit**, and (as of Phase 4) **understand**
them — all through a clean, renderer-independent domain model rather than by poking at
the canvas.

The project is built in strict, self-contained modules. Each layer talks to the next
through a narrow, typed seam, so capabilities stack without rewrites.

```
Excalidraw ⇄ Rendering Engine ⇄ Diagram Runtime ⇄ Diagram DSL  ← source of truth
                                                        ↑
                              AI layer (@/ai): Generation · Editing · Understanding
```

---

## What's implemented

### Phase 1 — Standalone editor _(done)_

- **Application shell** — dashboard, project CRUD UI, routing, editor layout, theming
  (light/dark/system, no flash), focused Zustand stores, responsive down to mobile.
- **Manual diagram editor** — Excalidraw integrated behind a clean `CanvasEngine`
  abstraction; engine-backed toolbar, live inspector, status bar; draw/move/resize/
  group/undo/redo — all native canvas behavior.
- **Cloud persistence + autosave** — FastAPI + PostgreSQL backend, real project CRUD,
  debounced timer-driven autosave with retry/offline handling. The engine speaks
  _scenes_; the DB stores _opaque JSON_ — neither is coupled to the other.
- **v1.0 polish** — editable inspector, full toolbar, keyboard shortcuts, settings,
  error boundaries, accessibility, collapsible panels.

### Phase 2 — Diagram DSL, engine & runtime _(done)_ · `src/dsl`, `src/diagram-engine`

- **The Diagram DSL** (`src/dsl`) — a pure, immutable, fully JSON-serializable domain
  model (`DiagramDocument`): normalized id-keyed collections, primitives, validation,
  migration, serialization/diff, and an ergonomic `DiagramModel` facade. Imports nothing
  from React/Excalidraw/the API. **This is the single source of truth.**
- **Rendering & sync engine** (`src/diagram-engine`) — a renderer-agnostic
  `RenderingEngine` (with an Excalidraw renderer), plus a live bridge that keeps the DSL
  and the canvas in sync in both directions.
- **The Diagram Runtime** — the sole mutation API: `execute` / `transaction` / `undo` /
  `redo` over patch-based history, operation-based undo, and a strongly-typed **event
  bus** (`operation:*`, `transaction:committed`, `diagram:changed`, …) that everything
  else observes without touching internals.

### Phase 3 — AI Foundation, Generation & Editing _(done)_ · `src/ai`, `src/features/ai`

- **AI Foundation** (`src/ai`, infra only) — a provider-agnostic orchestration layer:
  `AIService`/`AIClient`, pluggable providers (Anthropic/OpenAI/Gemini/Local/Mock),
  `PromptBuilder`, `ContextBuilder`, `IntentAnalyzer`, `ResponseValidator` (zod),
  `OperationPlanner`, `ConversationManager`, metrics, and an `AIPipeline` extensibility
  seam. Talks to the diagram only through read/write **ports** (`DiagramContextSource` /
  `DiagramGateway`).
- **AI Diagram Generation** (`src/ai/generation`) — natural language → diagram. The LLM
  emits a _semantic_ `DiagramPlan` only; the app validates it, lays it out
  (`ExecutionPlanner` + `LayoutEngine`, dagre), and applies it through the runtime.
  `MockPlanProvider` gives a no-API-key demo.
- **Conversational Editing** (`src/ai/editing`) — the LLM emits a semantic `EditPlan` of
  `ElementReference`s; a `ReferenceResolver` resolves them (ambiguity → clarification,
  never a guess), an `EditExecutionPlanner` plans, and a preview → approve/reject gate
  precedes a single-undo apply.
- **AI Copilot experience** (`src/features/ai`) — a docked `AiSidebar` + `useAiCopilot`
  hook: streaming stages, execution timeline, operation summary (from runtime patches),
  history, prompt library, settings, retry/regenerate/cancel/restore.

### Phase 4 · Module 1 — Diagram Understanding Engine _(done)_ · `src/ai/understanding`

The AI can generate and edit; now it can **understand**. This module is a **compiler
front-end**: it compiles the Diagram DSL ("source code") into a **Semantic Graph** (the
intermediate representation) that every future understanding feature consumes _instead
of_ the raw DSL.

- **Semantic Graph (IR)** — immutable, strongly-typed `SemanticEntity` / `SemanticRelationship`
  / `SemanticGroup` with an open, extensible kind vocabulary, precomputed adjacency +
  secondary indexes (`GraphIndex`), and aggregate `GraphStats`. Two orthogonal axes kept
  separate: the **relationship graph** and the **containment tree**.
- **Graph analysis** — traversal, reachability, k-hop neighbourhood, shortest/all paths,
  dependency chains, connected components, cycle detection, topological order, ancestors/
  descendants, ranked search — all O(V+E), direction-aware, kind-filterable.
- **Context extraction** — scope (whole / selection / entity / group / subgraph /
  neighbourhood / path) → a compact, **token-budgeted**, relevance-ranked slice with
  explicit truncation, rendered to a fenced-JSON block.
- **Semantic summaries** — deterministic prose + digests (diagram/entity/group/selection/
  subgraph/topology) that become prompt grounding.
- **Query API** — `SemanticQuery`, the single clean surface future modules use.
- **Incremental sync + caching** — identity-diffed incremental rebuilds (reclassify only
  the delta, reuse unchanged objects by reference) driven off a `DiagramChangeSource`
  port, with dependency-aware `RegionCache`s that invalidate _only changed regions_.
- **Validation** — integrity checks over the IR (broken refs, circular ownership,
  duplicate ids, …).

**No user-facing AI features yet** — only the semantic foundation. See the module's
**[README](./src/ai/understanding/README.md)** for the full design, decisions, and how it
enables Explain Mode, Diagram Review, AI Insights, Smart Import, and multi-agent reasoning
without further architectural change.

---

## Tech stack

**Frontend:** React · TypeScript (strict) · Vite · Tailwind · shadcn/ui (Radix) ·
React Router · Zustand · TanStack Query · Excalidraw · zod · dagre

**Backend:** FastAPI · SQLAlchemy 2 · PostgreSQL · Alembic (see `backend/`)

## Getting started

```bash
npm install
npm run dev        # dev server (http://localhost:5173)
npm run build      # type-check + production build
npm run typecheck  # strict type-check only
npm run test       # vitest (watch)  ·  npm run test:run for CI
npm run lint       # ESLint
```

Full-stack (with the backend) instructions are in `backend/README.md`.

---

## Architecture at a glance

```
src/
├── app/ components/ pages/ hooks/ store/ services/ utils/   # Phase 1 app shell
├── features/
│   ├── canvas/        # CanvasEngine abstraction over Excalidraw
│   └── ai/            # AI Copilot experience (AiSidebar, useAiCopilot)
├── dsl/               # the Diagram DSL — pure, immutable source of truth
├── diagram-engine/    # rendering, live sync, runtime (mutation API + event bus)
└── ai/                # the AI layer (talks to the diagram only through ports)
    ├── core/ providers/ planning/ validation/ conversation/ pipeline/   # Foundation
    ├── generation/    # NL → diagram
    ├── editing/       # conversational editing
    └── understanding/ # Diagram Understanding Engine (Phase 4 M1) — the Semantic Graph
```

### Key architectural decisions

- **The DSL is the single source of truth.** Everything — rendering, runtime, AI —
  reads and writes the immutable `DiagramDocument`. It is renderer/backend/AI-agnostic
  and _is_ the serialization format. The DB stores it as opaque JSONB.
- **One mutation path.** All changes go through the `DiagramRuntime` (validate →
  transaction → apply → commit → patch → history → events). Undo/redo, autosave, AI, and
  understanding all hang off the same typed event stream — no duplicated mutation logic.
- **The AI layer is decoupled by ports.** `@/ai` imports `@/dsl` for _types only_ and
  reaches the live diagram through `DiagramContextSource` (read), `DiagramGateway`
  (write), and `DiagramChangeSource` (change events). It never imports the runtime, the
  canvas, Excalidraw, or React. The app wires the seams.
- **The LLM emits _semantics_, never geometry or operations.** Generation produces a
  semantic `DiagramPlan`; editing produces a semantic `EditPlan`; understanding consumes
  a Semantic Graph. Deterministic app code owns layout, references, execution, and undo —
  so a hallucinated field can't corrupt the document.
- **Renderer independence is absolute across the AI layer.** No renderer concept appears
  in generation, editing, or understanding. Swapping Excalidraw means writing one adapter.
- **Immutability + structural sharing** makes incremental work and cache invalidation
  correct: unchanged objects keep their identity, so diffs and cache keys are cheap.
- **Every feature is an extensibility seam.** New AI capabilities register an
  `IntentHandler` and read the Semantic Graph through `SemanticQuery` — the rest of the
  pipeline already exists.

Deeper design docs live beside their code: **[ARCHITECTURE.md](./ARCHITECTURE.md)**,
`src/dsl/README.md`, `src/diagram-engine/README.md`, `src/ai/ARCHITECTURE.md`,
`src/ai/generation/GENERATION.md`, `src/ai/editing/EDITING.md`, and
`src/ai/understanding/README.md`.

---

## Roadmap

**Phase 1–3 (done)** — editor, DSL, engine/runtime, AI foundation, generation, editing,
copilot UX.

**Phase 4 · Module 1 (done)** — the Diagram Understanding Engine: the Semantic Graph and
everything that reads it.

**Phase 4+ (next)** — the understanding-powered, read-only capabilities that consume the
Semantic Graph with **no changes to the engine**: **Explain Mode**, **Diagram Review**,
**AI Insights**, then **Smart Import** and multi-agent reasoning.
