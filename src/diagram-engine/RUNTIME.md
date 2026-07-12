# Live Runtime (Module 3)

Module 3 makes the **Diagram DSL the live source of truth**. Excalidraw stays the
direct-manipulation *input surface*, but every change is captured into the DSL,
the DSL is the only thing persisted, and DSL changes render back to the canvas.

```
User ▸ Excalidraw ▸ CanvasEngine ▸ CanvasPort ▸ CanvasBridge ▸ LiveSynchronizer
                                                                     │ parse (guarded)
                                                                     ▼
                                                                DiagramRuntime  ← DSL, source of truth
                                                                     │ sync (guarded)
                                                                     ▼
  Excalidraw ◀ CanvasEngine ◀ CanvasPort ◀ CanvasBridge ◀ RenderingEngine ◀────┘
                                                                     │
                                                             persist DSL (autosave)
```

> The pure runtime lives in `src/diagram-engine/` (state/, bridge/, sync/,
> integration/) and imports only `@/dsl`. The React binding lives in
> `src/features/canvas/runtime/` (`ExcalidrawCanvasPort`, `DiagramRuntimeProvider`).

## Source-of-truth boundary

You can't intercept a drag before Excalidraw renders it without reimplementing
Excalidraw. So "DSL is the source of truth" means: the bridge keeps the DSL in
lock-step with the canvas (`canvas → parse → DSL`), the DSL is the **only** thing
persisted and the **only** thing future AI reads/writes, and DSL edits flow back
(`DSL → sync → canvas`). Existing inspector/toolbar commands still drive the
canvas imperatively — their resulting scene change is captured into the DSL like
any other, so they too "flow through the DSL." Nothing outside the canvas feature
touches Excalidraw.

## Components

| Piece | Role |
| --- | --- |
| `DiagramRuntime` (`state/`) | Holds the DSL as immutable, versioned state; commits **idempotently**; emits events. |
| `CanvasPort` (`bridge/`) | Abstract live canvas (`getScene`/`applyScene`/selection/`onChange`). `ExcalidrawCanvasPort` implements it over `CanvasEngine`. |
| `CanvasBridge` (`bridge/`) | Coordinator: canvas change → guarded ingest; program commit → apply to canvas; selection passthrough. Coalesces the change stream. |
| `LiveSynchronizer` (`sync/`) | The guarded `fromCanvas` (parse+merge+commit) / `toCanvas` (sync+apply). |
| `TransactionManager` / `OriginTracker` / `VersionManager` (`sync/`) | The loop guards (below). |
| `EditorIntegration` (`integration/`) | One factory that assembles runtime + bridge + lifecycle. |

## Synchronization lifecycle

**Canvas → DSL** (a user edit): `port.onChange` → (coalesced ~120 ms) →
`LiveSynchronizer.fromCanvas` → `engine.parse(scene)` → **merge** into the current
document (nodes/edges/viewport from the canvas; doc-level entities preserved from
the runtime) → `runtime.commit(next, 'canvas')`. Idempotent, so an unchanged scene
is a no-op.

**DSL → canvas** (a program edit, e.g. future AI): `runtime.mutate(...)` →
`commit(origin:'program')` → bridge → `LiveSynchronizer.toCanvas` →
`engine.sync(prev, next, currentScene)` → a minimal, reference-stable scene →
`port.applyScene` (elements only — selection and viewport untouched).

## Loop prevention — three layered guards

A `Canvas → DSL → Canvas → DSL …` cycle is impossible; any one guard terminates it:

1. **Sync lock** (`TransactionManager`) — while the bridge writes to the canvas,
   the lock is held and synchronous `onChange` echoes are dropped immediately.
2. **Scene signature** (`VersionManager`) — an Excalidraw-style scene version
   (Σ element versions + count) plus a viewport key; a change matching the
   last-applied signature is an echo → dropped (catches async echoes past the lock).
3. **DSL idempotency** (authoritative) — the parsed+merged document is compared with
   `equals`; if unchanged, no commit and no render. Even if lock and signature both
   miss, this terminates the cycle.

Plus **origin tracking**: every commit is tagged `canvas | program | load`; only
`program` commits render back to the canvas. Verified live: a draw produces exactly
one persisted write, and reopening a saved diagram triggers **zero** re-saves
(fully idempotent round-trip on real Excalidraw).

## Incremental rendering

`toCanvas` never rebuilds the scene: `engine.sync` reuses unchanged element object
references and version-bumps only what changed, and `applyScene` hands Excalidraw
that reference-stable array (Excalidraw reconciles by id + version, repainting only
the bumped elements). `applyScene` deliberately omits `selectedElementIds` and
viewport, so **selection and viewport are preserved** across programmatic updates.
The canvas→DSL parse is coalesced so a drag's continuous `onChange` ticks collapse
into a single ingest — smooth on large diagrams.

## Persistence

Autosave now serializes `runtime.getDocument()` — the DSL document — instead of the
Excalidraw scene. `resolveInitialState` (`features/canvas/persistence`) handles
three inputs: a stored **DSL document** (used directly), the legacy
**`{schema:'excalidraw'}` envelope** (parsed into the DSL as a one-time migration),
and **empty** (a fresh DSL document). The backend is unchanged (opaque JSONB).
`updatedAt` is treated as document metadata, not a canvas-derived value, so merely
opening a diagram never dirties it.

## Testing

- **Pure Vitest** (`__tests__/live/`, `FakeCanvasPort` that echoes applied scenes):
  drag/resize/delete/add ingest, three-guard loop prevention, rapid-edit coalescing,
  program apply, selection + viewport sync, and a 2000-node scale test.
- **Browser E2E** (headless Chrome via CDP): draw → persisted payload is a DSL
  document (not the legacy envelope); reopen → idempotent, no re-save, no loop, no
  console errors; legacy diagram → migrates and loads clean.

## Phase 3 readiness

AI generation / conversational editing plug in with **zero new canvas coupling**:
mutate the DSL through `runtime.mutate(...)` (or a future operations layer) and the
bridge renders the minimal update to the canvas; subscribe to `runtime`/`bridge`
events (`node:created`, `bridge:dsl-committed`, `bridge:selection-changed`, …) for
context. Selection is available via `bridge.getSelection()`. AI never sees
Excalidraw — only the DSL.
