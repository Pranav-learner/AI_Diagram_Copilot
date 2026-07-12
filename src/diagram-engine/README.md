# Diagram Engine

The **rendering & synchronization engine** translates the Diagram DSL
(`src/dsl/`) to and from concrete scene formats. The DSL stays the single source
of truth; a renderer is just a view.

```
DSL ─ validate ─▶ map ─▶ Renderer ─▶ Scene ─▶ (CanvasBridge) ─▶ Canvas ─▶ Excalidraw
   ◀───────────────────── parse ◀────────────────────────────────────────────┘
```

> **Status:** Phase 2 · Module 2 — a pure, Vitest-tested library. Additive: it
> imports `@/dsl` and **nothing else** (no Excalidraw, React, or backend). It is
> not yet wired into the live editor; the `CanvasBridge` seam (below) is how a
> later module will connect it.

---

## Why this exists

Manual editing, AI generation, review, and import/export all need to move between
the DSL and *something renderable*, without leaking Excalidraw into the domain
model. This engine is that boundary — and it's built so a second backend (Mermaid,
SVG, Draw.io, Canvas2D) is a drop-in, not a rewrite.

---

## The rendering pipeline

`RenderingEngine` is the façade. It picks a `Renderer` from the `RendererRegistry`,
threads a fresh `RendererContext` (config + node-type registry + warning sink),
validates, and emits events.

| Operation | Direction | Notes |
| --- | --- | --- |
| `render(doc)` | DSL → scene | Validates first (`RenderError` on invalid). Pure/deterministic. |
| `parse(scene)` | scene → DSL | Reverse-maps manual edits back into the DSL. |
| `sync(prev, next, scene)` | DSL Δ → scene Δ | Minimal, reference-stable update + change set. |

```ts
import { createExcalidrawEngine } from '@/diagram-engine';
const engine = createExcalidrawEngine();
const { scene } = engine.render(doc);
const { changeSet } = engine.sync(prevDoc, nextDoc, scene);
const { document } = engine.parse(editedScene);
```

---

## Mapping strategy — the two-channel loss-aware bridge

Excalidraw and the DSL model different things, so each direction escrows what the
other can't express. This makes round-trips **lossless in both directions**.

1. **Element escrow** — `element.customData.adc` holds the authoritative DSL
   entity behind each element. So DSL-only concepts (`semantic`, `z`, `tagIds`,
   `layerId`, `metadata`, `revision`, edge `routing`/`waypoints`, non-rectangular
   shapes like `cylinder`) survive `DSL → scene → DSL`.
2. **Document escrow** — `appState.customData.adc` holds document-level entities
   that aren't elements (groups, layers, styles, tags, annotations, comments, doc
   metadata, full viewport). So the whole document round-trips.
3. **Excalidraw metadata** — the reverse channel `node.metadata.__excalidraw`,
   written only when parsing a *manually-drawn* element, preserves
   Excalidraw-only fields (`seed`, `roughness`, …) for `scene → DSL → scene`.

**Who wins on parse?** The element fields are authoritative for what they
represent (so manual moves/edits are captured); the escrow fills the gaps.
`StyleMapper.elementToStyle` emits **only non-default fields**, so merged over the
escrowed DSL style it contributes nothing when unchanged (→ identity) and exactly
the changed field when edited (→ captured). If the document escrow is ever lost (a
real Excalidraw session normalizes appState), parse degrades gracefully: nodes and
edges still carry their own escrow, and group membership survives in `groupIds`.

Mapping specifics: `NodeMapper`, `EdgeMapper`, `StyleMapper`, `GroupMapper`,
`ViewportMapper` (all under `renderers/excalidraw/mappers/`). Semantic node types
render as their DSL-resolved shape (via the Module-1 `NodeTypeRegistry`) and
restore `semantic` from escrow. Labels render as **bound text** elements and
reverse-map into `node.label`.

---

## Synchronization & the diff algorithm

`sync` never rebuilds the canvas. Steps:

1. **DSL diff** — `diff(prevDoc, nextDoc)` from `@/dsl`. If empty, short-circuit:
   return the **same scene reference** and an empty change set. This idempotency is
   the real guard against a render→parse→render **feedback loop**.
2. **Full render of `nextDoc`** — cheap (pure object construction).
3. **Reconcile** (`SceneComparator.reconcile`) against the current scene by id:
   - unchanged → **reuse the existing element object reference** (no repaint),
   - changed → **version-bump** past the current element (so Excalidraw accepts the
     update as newer, not stale),
   - present-only-in-next → **add**, present-only-in-current → **remove**.

The result is a mostly reference-stable element array plus a `SceneChangeSet`
(`added` / `updated` / `removed`). Moving one node in a 2000-node diagram touches
~3 elements; the other 3999 keep their references. Viewport-only changes touch
`appState` and no elements. Selection is never written, so it's preserved.

---

## Event system

`engine.events` is a typed `EventEmitter`. `on()` returns an unsubscribe function;
a throwing subscriber can't break delivery to others.

`renderer:ready` · `scene:changed` · `node:created|updated|deleted` ·
`edge:created|updated|deleted` · `selection:changed` · `viewport:changed` ·
`error`. Future modules subscribe here (an AI module watches `node:created`, a
presence layer `selection:changed`) with zero coupling to internals.

---

## Renderer architecture — adding a backend

Implement `Renderer<TScene, TElement>` and register it:

```ts
class SvgRenderer implements Renderer<SvgScene, SvgNode> { /* render/parse/… */ }
new RendererRegistry().register(new SvgRenderer());
```

The engine core (`RenderingEngine`, registry, synchronizer, events) speaks only
the interface — it never names Excalidraw. The interface has three concerns:
whole-document (`render`/`parse`), entity-level (`renderNode`/`renderEdge`, for
sync), and scene plumbing (`getElements`/`withElements`/`elementId`/
`elementsEqual`/`bumpVersion`/`applyViewport`) that lets the *generic* synchronizer
manipulate any scene. Not every backend must be bidirectional — advertise support
via `capabilities`.

---

## Determinism

No randomness. Element `seed`/`versionNonce` are a stable hash of the DSL id;
`version` starts at 1 and advances only during sync; `updated` is a config epoch.
So `render(doc)` is a pure function — equal documents produce byte-identical
scenes, which is what makes snapshot tests and idempotent sync work.

---

## The CanvasBridge seam (future wiring)

This module is a library; it does not touch the live editor. A later module adds a
thin bridge in `src/features/canvas/`:

- **DSL → canvas**: `engine.sync(prev, next, currentScene)` → apply the reconciled
  elements via `CanvasEngine.setScene` (the plain JSON here is exactly what it
  accepts). Because sync is reference-stable and idempotent, updates are minimal
  and flicker-free.
- **canvas → DSL**: on a user edit, `engine.parse(scene)` → the new DSL document.
- **Loop safety**: tag each origin (`dsl` vs `canvas`) and rely on sync
  idempotency — a canvas change that merely reflects the current DSL yields an
  empty change set, so the cycle terminates.

---

## Future modules

- **AI editing** previews changes by building a next document and calling `sync`
  (a `SceneChangeSet` is the preview), then subscribes to events.
- **Import/Export** are just more `Renderer`s (Mermaid text ⇄ DSL, SVG ← DSL).
- **Review / multi-agent** consume the DSL `diff` this engine already relies on.

---

## Testing

`npm run test:run`. Suites in `__tests__/`: full-document round-trip identity
(`equals(parse(render(doc)), doc)`) across every shape/semantic/edge/style/group/
viewport; scene stability (`render→parse→render`); determinism; sync minimality +
object reuse + version bump + idempotency + cascade + events; a 2000-node scale
test; and error handling (invalid DSL, dangling edges, missing renderer, manual
elements). Deterministic via the DSL sequential id factory + fixed clock.
