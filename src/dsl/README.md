# Diagram DSL

The **Diagram DSL** is the domain model at the heart of the AI Diagram Copilot —
a pure, strongly-typed, versioned representation of a diagram. It is the
**single source of truth**. Everything else (the Excalidraw canvas, the backend,
future AI modules) is a _renderer_, _store_, or _producer/consumer_ of this
model.

> **Status:** Phase 2 · Module 1 — foundation only. No rendering, no Excalidraw
> sync, no AI, no import/export. Just the model and the tools that operate on it.

---

## Why a DSL?

Today the Excalidraw scene is the source of truth. That couples every future
feature to Excalidraw's data format and to the canvas being present and
interactive. It does not survive AI generation ("produce a diagram" → _what_
do you produce?), conversational editing ("make the database red" → _which_
element, addressed _how_?), review, or multi-agent editing.

The DSL inverts this:

```
User ▸ Diagram Controller ▸ Diagram DSL ▸ Rendering Engine ▸ Canvas ▸ Excalidraw
                              ▲ source of truth
```

Every future module reads and writes the **DSL**, never Excalidraw JSON:

- **AI Generation** builds a `DiagramModel` and emits its `document`.
- **Conversational Editing** applies `operations` to the model and `diff`s the result.
- **Explain / Review** walk the typed entities and attach `metadata` / `comments`.
- **Import / Export** map foreign formats to/from the `DiagramDocument`.
- **Multi-Agent Editing** merges independent `DocumentDiff`s.

The DSL knows **nothing** about React, Excalidraw, FastAPI, the canvas, or LLMs.
It is designed to be extractable as a standalone, open-source framework.

---

## Architecture & layering

The package is layered; each layer depends only on those above it.

| Layer            | Folder            | Responsibility                                             |
| ---------------- | ----------------- | ---------------------------------------------------------- |
| **Primitives**   | `primitives/`     | Branded ids + `IdFactory`, geometry, scalars, `Clock`.     |
| **Core**         | `core/`           | `EntityBase` (identity/versioning), `Metadata`, errors.    |
| **Model**        | `model/`          | Entity data types + `DiagramDocument` root + registry.     |
| **API**          | `api/`            | Pure `operations`, `factory` builders, `DiagramModel`.     |
| **Validation**   | `validation/`     | Composable rules → `validate(doc)`.                        |
| **Serialization**| `serialization/`  | `serialize`/`deserialize`, `clone`, `equals`, `diff`.      |
| **Migration**    | `migration/`      | Schema version chain (`migrate`).                          |
| **Repository**   | `repository/`     | Storage-agnostic load/save port + in-memory impl.          |

### Two design pillars

1. **Data-oriented core + thin OO facade.** The document is plain, immutable,
   fully JSON-serializable data — it _is_ the serialization format. All mutations
   are pure functions (`operations`) that return a **new** document (structural
   sharing). [`DiagramModel`](./api/DiagramModel.ts) is an ergonomic object
   wrapper so callers (and AI) never hand-edit raw JSON, while serialization/diff
   stay trivial.

2. **Normalized store.** Entities live in **id-keyed maps** (`Record<Id, T>`),
   not arrays — O(1) lookup, structurally-unique ids, and clean id-addressed
   patching/diffing. Stacking order is a per-node `z` field.

---

## Entities & relationships

```
DiagramDocument (root)
├── metadata            open bag (aiGenerated, confidence, reviewed, …)
├── viewport            zoom / pan / canvasSize / background / grid
├── nodes    ─────────▶ DiagramNode  (shape | text | image | icon | container)
│                          ├─ style? | styleRef ─▶ styles
│                          ├─ groupId ───────────▶ groups
│                          ├─ layerId ───────────▶ layers
│                          └─ tagIds  ───────────▶ tags
├── edges    ─────────▶ DiagramEdge  source/target ─▶ nodes (Endpoint)
├── groups   ─────────▶ DiagramGroup childIds ─▶ nodes & groups (nestable)
├── layers   ─────────▶ Layer
├── styles   ─────────▶ NamedStyle   (reusable, referenced by styleRef)
├── tags     ─────────▶ DiagramTag
├── annotations ──────▶ Annotation   target ─▶ node | edge | point
└── comments    ──────▶ DiagramComment (threaded) target ─▶ node | edge | point
```

Every entity extends **`EntityBase`**: `id`, `revision` (per-entity edit
counter), `createdAt`, `updatedAt`, `metadata`.

### The node model — the extensibility core

Nodes are a discriminated union on `type`, but only where the _payload_ differs
(`text`, `image`, `icon`, `container`). The long list of _semantic_ kinds
(database, service, queue, cache, api, …) does **not** each become a union
member — they are all a `ShapeNode` carrying:

- **`shape`** — the visual primitive (`rectangle`, `cylinder`, `diamond`, …)
- **`semantic`** — the domain meaning (`database`, `service`, … — an **open**
  type)

New semantic types are runtime entries in the
[`NodeTypeRegistry`](./model/registry.ts) (default shape/size/style/label), so
**adding a node type requires no change to the core union or any switch.** This
separation of _visual primitive_ from _domain meaning_ is the single most
important extensibility decision in the model.

---

## Schema & versioning

Two distinct version concepts — do not conflate them:

- **`schemaVersion`** (document-level, semver, e.g. `1.0.0`) — the _format_
  version. Drives migration. `CURRENT_SCHEMA_VERSION` lives in
  [`migration/versions.ts`](./migration/versions.ts).
- **`revision`** (per-entity, integer) — a monotonic edit counter for optimistic
  concurrency and cheap change detection.

### Migration strategy

`deserialize` runs `parse → migrate → assert-shape`. `migrate` walks an ordered
chain of `Migration { from, to, up }` steps from the document's `schemaVersion`
up to `CURRENT_SCHEMA_VERSION`. Today the chain is empty (1.0.0 is the first
version) but the machinery exists: a future `1.0.0 → 1.1.0` is a one-line
addition to `MIGRATIONS`, and every stored document upgrades transparently on
load. Documents authored by a _newer_ schema than the build understands are
rejected rather than silently corrupted.

---

## Validation

`validate(doc)` runs composable rules and returns
`{ valid, issues, errors, warnings }`. `valid` is true iff there are no
error-severity issues. Rules cover: id/key consistency, cross-collection id
uniqueness, dangling edge endpoints, missing group/container children, circular
group nesting, unresolved style/layer/tag references, and orphaned
annotation/comment targets (warning). The rule set is exported — add a
project-specific rule without editing the built-ins (Open/Closed).

---

## Quick start

```ts
import { DiagramModel } from '@/dsl';

const model = DiagramModel.create({ name: 'Checkout flow' });

const api = model.createNode({ type: 'shape', semantic: 'api', position: { x: 0, y: 0 } });
const db = model.createNode({ type: 'shape', semantic: 'database', position: { x: 240, y: 0 } });
model.createEdge({ source: { nodeId: api.id }, target: { nodeId: db.id } });

model.setMetadata('aiGenerated', true);

const result = model.validate();          // { valid: true, ... }
const json = model.serialize();           // stable JSON string
const restored = DiagramModel.fromJSON(json);
```

Functional style is available too:

```ts
import { operations, validate, diff } from '@/dsl';
const next = operations.updateNode(doc, nodeId, { position: { x: 10, y: 10 } }, clock);
const changes = diff(doc, next);
```

---

## How future AI modules integrate

- **Generate** — build a `DiagramModel` (deterministic via an injected
  `IdFactory`/`Clock`), attach `metadata.aiGenerated` / `confidence`, `validate()`
  before committing, emit `document`.
- **Edit conversationally** — resolve the user's reference to an id, apply an
  `operation`, `validate()`, and show a `diff` preview before saving.
- **Review / Explain** — traverse typed entities; attach `Annotation`s and
  threaded `DiagramComment`s; never mutate geometry.
- **Multi-agent** — each agent produces a `DocumentDiff`; a merge step reconciles
  them. `revision` and stable serialization make conflict detection precise.
- **Repair loops** — `validate()` returns machine-readable `ValidationCode`s an
  agent can react to (e.g. re-point a `edge.danglingEndpoint`).

Because the model is pure data behind a typed facade, an LLM can be handed the
`DiagramModel` API (or the JSON document) and can never produce anything the
validation layer won't catch.

---

## Testing

`npm run test:run` (Vitest). Suites live in `__tests__/` and cover factories,
operations + cascade integrity, every validation rule, serialization round-trip,
clone independence, equality/diff, migration (identity + synthetic upgrade +
rejection), the repository, styles, and a 5000-node scale test. Determinism is
achieved with a sequential `IdFactory` and a fixed `Clock`.
