# Operation Runtime (Module 4)

The **DiagramRuntime** is the execution engine and the **only** way to modify the
DSL. Every mutation is a typed, immutable **Operation** run through a pipeline of
validation → transaction → apply → commit → patch→history → events → render.
Neither the UI nor future AI touches the DSL directly.

```
User / AI ▸ Operation ▸ DiagramRuntime ─ validate ─ transaction ─ apply ─▶ DSL
                                                                    │ patch → history
                                                                    ▼ commit → events
                                                            Rendering Engine ▸ Canvas
```

## Operation lifecycle

An `Operation` is a small immutable command:

```ts
interface Operation {
  type: string;                 // 'node.move'
  label: string;                // 'Move node'
  coalesceKey?: string;         // history compression
  validate(ctx): OperationIssue[];   // preconditions — reject before mutating
  apply(ctx): DiagramDocument;       // forward-only; reuses the DSL's operations/builders
}
```

`runtime.execute(op)` runs `validate` (empty issues required, else `OperationError`
and **no mutation**), applies it to produce the next document, commits, and pushes
one undoable history entry. Operations never write an inverse — see below.

Factories live in `operations/` (e.g. `moveNode(id, pos)`, `connectNodes(a, b)`,
`createGroup(...)`). They're also in an `OperationRegistry` so a data-driven
producer (a Phase-3 AI planner, a serialized op log) can rebuild one from
`{ type, params }` via `runtime.executeType(type, params)`.

## The reversibility model — patches, not inverses

Operations are **forward-only**. The runtime derives reversibility by diffing the
before/after documents into a compact **`DocumentPatch`** (only the entities that
changed). This is the module's central decision:

- **Operation-based history, not snapshots** — entries store deltas, so history is
  memory-cheap even for large diagrams.
- **No inverse to write** — adding a new operation is just `apply` + `validate`;
  the runtime handles undo. (Cascade deletes are captured for free, because the
  diff sees every removed entity.)
- **Undo** applies `invertPatch(entry.patch)`; **redo** re-applies it. Patch
  algebra (`applyPatch`/`invertPatch`/`composePatches`) lives in `patch/`.

## Transactions (atomicity)

`runtime.transaction(fn)` runs operations against a private *working document*.
On success it commits **once** with a **single** history entry; if any operation
fails, the whole transaction rolls back and the DSL is untouched. Transactions
**nest** — only the outermost commits. `executeBatch(ops)` is a transaction, so
"duplicate selection / delete many / paste / an AI response" are atomic and undo
as one step.

## History & compression

`HistoryManager` holds undo/redo stacks of `{label, patch}`. A new operation
clears the redo stack. Consecutive entries with the same `coalesceKey` (every tick
of one drag, a pan/zoom gesture) are folded into one entry via `composePatches`,
and the stack is capped — so a long drag is a single, cheap undo. `history:changed`
carries `{canUndo, canRedo, undoDepth, redoDepth, …}`.

## Events

`runtime.events` (`RuntimeEventBus`) emits `operation:started|completed|failed`,
`transaction:started|committed|rolled-back`, `history:changed`, `commit`,
`diagram:changed`, `selection:changed`, `viewport:changed`. Future AI /
collaboration / telemetry subscribe here — no coupling to internals.

## Live integration

- **Manual editing → operations.** The `CanvasBridge` computes a merged document
  from the canvas and calls `runtime.recordCanvasChange(mergedDoc)` — which
  commits (origin `'canvas'`, no re-render) and pushes an operation-labelled,
  undoable history entry. No re-apply → no derivation drift.
- **Operation-based undo/redo, live.** The toolbar Undo/Redo and Ctrl/Cmd+Z
  (intercepted at capture phase so Excalidraw's native undo never fires) call
  `runtime.undo()/redo()`, which commit origin `'program'` → the bridge renders
  the reverted state (`applyScene({captureHistory:false})`). Verified in-browser:
  draw → Undo removes the node (persisted) → Redo restores it, no console errors.
- **`recordCanvasChange` vs `execute`.** Canvas edits already happened on the
  surface, so they're *recorded*; programmatic edits (AI, UI commands) are
  *executed* (validated + applied + rendered). Both land in the same history.

## Adding a new operation

1. Write a factory in `operations/` returning `{ type, label, validate, apply }`.
   `apply` should use the DSL's `operations`/builders so cascades come for free.
2. (Optional) register it in `createDefaultOperationRegistry` for data-driven use.

That's it — no inverse, no runtime changes, no history changes.

## Phase-3 AI integration

A planner emits a list of Operations (or `{type, params}` descriptors) and calls
`runtime.executeBatch(ops)` — one atomic, undoable transaction. It reads context
from the document and subscribes to runtime events; it never sees Excalidraw or
mutates the DSL directly. A rejected operation surfaces typed `OperationIssue`s the
planner can react to. This is exactly the seam AI Diagram Generation and
Conversational Editing plug into.

## Testing

`__tests__/runtime/`: operation execution + validation (missing node, duplicate id,
locked, circular group), undo/redo correctness + redo-clearing + drag coalescing,
nested transactions + rollback + batch atomicity, patch round-trip + composition,
event ordering, and a 2000-node execute+undo. Plus the browser E2E above.
