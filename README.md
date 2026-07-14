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

### Phase 4 · Module 2 — Explain Mode _(done)_ · `src/ai/explain`

The first capability built on the Semantic Graph. Click any node, relationship,
group, path, or selection and get a mentor-grade explanation that adapts to the
element, its surroundings, the detected **domain**, the **audience** (beginner /
intermediate / expert), the **style** (business / technical / educational), and the
**depth** (overview / detailed). Ask scoped follow-ups; explore graph-derived
related elements and suggested questions.

- **Reasons only over the Semantic Graph + Context View** — never the DSL or a
  renderer. The pipeline is `plan → context → prompt → LLM → validate → format`,
  each stage independent.
- **The `ExplanationPlanner`** resolves the target, detects the domain, picks
  depth/audience/style, and maps the target to a compact `ContextScope` — so the
  LLM sees a focused, token-budgeted slice, never the whole diagram.
- **The model returns prose only**; related elements and suggested questions are
  derived deterministically from the graph (never hallucinated).
- **Region-aware explanation cache** invalidates only the parts touched by an edit;
  **read-only** throughout (no mutation). Works with **zero config** via a heuristic
  mock provider. Delivered in the copilot sidebar as a per-turn explanation panel
  with markdown, related-element chips, follow-ups, and a depth toggle.

See **[src/ai/explain/README.md](./src/ai/explain/README.md)** for the full design and
how it prepares Diagram Review and AI Insights.

### Phase 4 · Module 3 — Diagram Review _(done)_ · `src/ai/review`

A professional static-analysis platform for diagrams — **the application discovers
issues; the AI explains them.** A deterministic rule engine runs over the Semantic
Graph and produces structured, traceable findings and transparent scores *before* any
LLM call; the model only interprets. If the model is unavailable, the review degrades
gracefully to findings + scores.

- **Pluggable rule engine** (ESLint-for-diagrams): ~20 independently-testable rules
  across software (SPOF via articulation points, missing gateway/auth/cache, coupling,
  bottlenecks, dead services, observability, separation of concerns), business flows
  (dead-ends, missing start/end, unreachable steps, missing approval), education
  (flat structure), and universal structure (cycles, disconnected, isolated).
- **Strongly-typed, traceable `Finding`s** (rule id, severity, confidence, affected
  entities, evidence, recommendation) and **transparent scoring** — every scorecard
  carries a rationale; dimensions adapt to the domain (architecture score,
  scalability, security, … / process efficiency / completeness) plus a computed
  complexity score. Strengths are derived deterministically too.
- **Static analysis precedes the LLM**; results are **deterministic**, region-cached,
  and **degrade gracefully**. Findings highlight affected elements on the canvas on
  click. Delivered in the copilot sidebar with scorecards, grouped findings, strengths,
  and priority actions.

See **[src/ai/review/README.md](./src/ai/review/README.md)** for the rule engine,
scoring model, and how it prepares AI Insights and Architecture Intelligence.

### Phase 4 · Module 4 — Diagram Intelligence Engine _(done)_ · `src/ai/intelligence`

The proactive **reasoning layer** — not another chat feature. It continuously
watches the diagram, runs the deterministic static analysis, and maintains a stateful
**Finding Repository** (new / resolved / recurring / dismissed, with history), which
it aggregates and **ranks** into a proactive **insight feed**. The LLM lazily narrates
a briefing ("I noticed this service has become a single point of failure"). The app
discovers and scores; the AI reasons and recommends.

- **Finding Repository** with incremental reconciliation (a `RepositoryDiff` of
  added/resolved/recurring), duplicate suppression, recurrence tracking, and user
  status (dismiss = hide; mark-resolved = fixed, resurfaces if still detected).
- **Transparent ranking** by severity · confidence · business/technical impact ·
  frequency · diagram context (hubs) · user activity — every insight explains *why*
  it ranked where it did. Findings are **merged by rule** (one insight over N nodes)
  and deduplicated.
- **Proactive & incremental**: refreshes on diagram change, skips unchanged versions,
  re-prioritises on selection, caches the briefing per version, and **degrades
  gracefully** (feed works with no LLM). Plus an **intelligence timeline**, contextual
  suggestions on selection, suggested next actions, and observability.
- Delivered as the copilot sidebar's **Insights** view: filterable feed, priority
  queue, briefing, next actions, timeline, and jump-to-affected-elements.

See **[src/ai/intelligence/README.md](./src/ai/intelligence/README.md)** for the
repository, ranking algorithm, lifecycle, and how it becomes the reasoning layer for
Smart Import, Reverse Engineering, multi-agent collaboration, and enterprise
intelligence.

### Phase 5 · Module 1 — Document Intelligence Engine / PKM _(done)_ · `src/ai/knowledge`

The first stage of the **Project Knowledge Model (PKM)** — a professional
knowledge-ingestion pipeline that turns unstructured documents into structured
knowledge. It does not generate diagrams or parse code; it is the knowledge
foundation every future document-facing feature consumes.

- **Structured Document Model** — a deterministic, dependency-free Markdown/text parser
  produces a renderer-independent IR (headings, sections, lists, tables, code,
  callouts, links, references) where every element has a unique id, position,
  hierarchy, and metadata.
- **Deterministic knowledge extraction** (no LLM) — entity, relationship, requirement,
  decision, and statement (goals/risks/constraints/assumptions) extractors emit
  evidence-backed, confidence-scored knowledge.
- **Project Knowledge Model** — merges extracted knowledge from all documents into one
  deduplicated, connected, fully-traceable graph; **incremental and reversible at
  document granularity** (`removeDocument` withdraws exactly one document's
  contributions).
- **Classification, indexing, search, summaries** — document-type + category taxonomy,
  precomputed PKM + incremental full-text indexes, unified keyword/entity/tag/category/
  relationship/document search, and deterministic digests; region-aware caching and
  validation throughout.

**No user-facing import yet** — only the knowledge foundation. See
**[src/ai/knowledge/README.md](./src/ai/knowledge/README.md)** for the model, the
extraction pipeline, and how the PKM will support Reverse Engineering, Smart Import,
Repository Analysis, AI Documentation, and multi-agent workflows.

### Phase 5 · Module 2 — Reverse Engineering Engine _(done)_ · `src/ai/reverse-engineering`

The deterministic static-analysis foundation for every future repository feature. It
turns source repositories + infrastructure manifests into a normalized AST, a Code
Knowledge Graph, and PKM entities — the structured representations the LLM reasons
over (never raw code). Parsing and analysis are 100% deterministic (no LLM), and it
**unifies with the Document Intelligence Engine through a shared PKM**.

- **Parser registry + 12 dependency-free parsers** — TypeScript/JavaScript, Python, Go,
  Java, SQL, Dockerfile, Docker Compose, Kubernetes, Terraform, OpenAPI, GraphQL, JSON
  Schema — each normalizing into one unified AST (parser-agnostic; new languages are
  plugins).
- **Static analysis** — dependency/import graph, call graph, inheritance/composition,
  infrastructure wiring, database foreign keys, API endpoints, and architecture
  extraction (bounded contexts, layers, services, shared libraries, integration points).
- **Code Knowledge Graph → PKM** — architecture-significant entities merge into the
  shared PKM, each retaining source/file/line/language/evidence/confidence.
- **Incremental** — ASTs cached by content hash (a changed file re-parses only itself),
  the graph rebuilt lazily, the PKM synced per-file by slice hash — never a full rescan.
  Symbol/dependency/API/infra/relationship search; validation throughout.

**No user-facing repository import yet** — only the reverse-engineering foundation. See
**[src/ai/reverse-engineering/README.md](./src/ai/reverse-engineering/README.md)** for
the parser architecture, AST normalization, and how it prepares Smart Import,
Repository Copilot, Architecture Visualization, AI Documentation, and multi-agent
workflows.

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

**Phase 4 · Module 2 (done)** — **Explain Mode**: click-to-explain any element, adapted to
domain / audience / depth, with follow-ups — the first capability on the Semantic Graph.

**Phase 4 · Module 3 (done)** — **Diagram Review**: a deterministic rule engine over the
Semantic Graph discovers findings and computes scores; the AI explains them.

**Phase 4 · Module 4 (done)** — **Diagram Intelligence Engine**: the proactive reasoning
layer — a stateful finding repository, ranked insight feed, timeline, and briefing.

**Phase 5 · Module 1 (done)** — **Document Intelligence Engine / PKM**: unstructured
documents → Structured Document Model → deterministic knowledge extraction → Project
Knowledge Model.

**Phase 5 · Module 2 (done)** — **Reverse Engineering Engine**: repositories +
infrastructure → normalized AST → Code Knowledge Graph → PKM, deterministically, unified
with documents.

**Phase 5+ (next)** — the capabilities the PKM + Code Knowledge Graph were built to
support: **Smart Import** (PKM → Architecture Planner → Diagram Planner → DSL),
Repository Copilot, Architecture Visualization, AI Documentation, and multi-agent
workflows.
