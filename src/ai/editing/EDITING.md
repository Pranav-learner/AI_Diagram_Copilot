# Conversational Diagram Editing — Architecture

Phase 3, Module 3. The second AI capability, built on the M1 Foundation and
reusing M2's execution/gateway spine. Users change an existing diagram in plain
English — *"Add Redis between the API and the Database"*, *"Color all backend
services blue"*, *"Delete Kafka"* — and the app turns intent into safe, previewed,
reversible edits.

> **The invariant (unchanged across the AI stack):** the LLM produces only a
> semantic **EditPlan**. It never edits the DSL, never emits runtime operations,
> and never sends coordinates or renderer details. The application understands
> the diagram, resolves references, previews the change, and only then compiles
> operations for the runtime — the sole mutator.

Import everything from `@/ai` (the editing module is re-exported there).

---

## 1. The pipeline (every stage isolated)

```
User prompt
   │
   ▼  IntentAnalyzer            (M1) — "edit" vs "generate"
   ▼  DiagramUnderstanding      semantic model of the CURRENT diagram
   ▼  Selection context         (part of the understanding)
   ▼  PromptBuilder             (M1) versioned edit template + context block
   ▼  AIService  → LLM          (M1) streamed completion
   ▼  EditPlan                  semantic edits + references (NO ids invented, NO coords)
   ▼  ResponseValidator         (M1) zod schema + confidence
   ▼  validateEditPlan          structural checks (dup refs, dangling new, self-connect)
   ▼  ReferenceResolver         "the database" / "these" / "largest" → concrete ids
   │     └─ ambiguous? → Clarification (ask, never guess)
   ▼  EditExecutionPlanner      resolved edits → OperationPlan + EditPreview
   ▼  ═══ PREVIEW ═══           user Approves / Rejects / Regenerates
   ▼  DiagramGateway (port) → DiagramRuntime   (one atomic, undoable transaction)
   ▼  Canvas
```

Two-phase and **preview-first**: `DiagramEditor.propose()` runs everything up to
the preview *without touching the runtime*; `DiagramEditor.apply()` executes an
approved proposal.

---

## 2. The EditPlan (`model/EditPlan.ts`)

A discriminated union of semantic edit ops — `add_node`, `remove_node`,
`rename_node`, `move_node`, `resize_node`, `connect`, `disconnect`,
`update_style`, `update_metadata`, `group`, `ungroup`, `reorder`. Two design
choices carry the module:

- **References, not ids.** Elements are pointed at by an `ElementReference`:
  `{by:'id'}` (an id the model read from the context), `{by:'label'}`,
  `{by:'selection', index?}`, `{by:'new', ref}` (a node added earlier in the same
  plan), `{by:'descriptor', text}` (fuzzy — may match several), or
  `{by:'superlative', metric}` ("largest", "leftmost"). The app resolves these.
- **Relative geometry.** `move_node`/`add_node` place elements *relative* to
  others (`relativeTo` + `direction`) — the model never sends coordinates; the
  app computes them.

The schema is the source of truth; TS types are `z.infer`'d from it.

---

## 3. Diagram Understanding (`DiagramUnderstanding.ts`)

Editing reasons about what exists. This builds a compact **semantic** snapshot
from the live document + selection (via the `DiagramContextSource` port): nodes
(id, label, role, size, position, group, colour, selected, z), edges (with
endpoint labels), groups/hierarchy, selection, and bounds. It is the single
source of truth for **both** the prompt (rendered as a JSON block exposing ids)
and the reference resolver. No renderer details leak.

---

## 4. Reference resolution & ambiguity (`ReferenceResolver.ts`)

The heart of "an experienced assistant, not a command line." Each reference
resolves to zero, one, or many ids:

- **id / new** → exact.
- **label** → exact then contains match.
- **selection** → the selected elements (or the Nth).
- **descriptor** → tokens matched against label + role.
- **superlative** → computed over geometry (area / position).

The calling edit decides what's valid: a rename needs exactly one; a recolour
accepts many. A **singular** edit whose reference matches several produces a
**Clarification** (question + candidate elements) — the pipeline stops and asks.
A reference matching nothing is an error. **Never a silent guess.** Clarifications
are resolved client-side by `DiagramEditor.disambiguate()` (pin the reference to
the chosen id and recompile) — no extra model call, works with any provider.

---

## 5. Validation (`validateEditPlan.ts`)

Two layers, both before mutation:

1. **Structural** (pre-resolution): duplicate new-node refs, `new` references to a
   node never added, self-connections.
2. **Conflict** (post-compile): a node the plan both deletes and otherwise edits.

Plus per-reference errors (unknown) and clarifications (ambiguous) from
compilation. Errors reject; a rejected plan never reaches the runtime.

---

## 6. Execution planning (`EditExecutionPlanner.ts`) — the app owns operations

Resolved EditPlan → `OperationPlan` (`{type, params}[]`) **and** an `EditPreview`
in lock-step. It maps edits to the runtime registry
(`node.create`/`node.delete`/`node.rename`/`node.move`/`node.resize`/
`node.style`/`node.update`/`edge.connect`/`edge.disconnect`/`group.create`/
`group.ungroup`/…), computes geometry (placement, nudges, z-order), and resolves
edge lookups for disconnect. Semantic colour names → DSL styles via
`editStyling.ts`. The plan is **atomic** → one undoable transaction. Every op type
is validated against the gateway's known operations, then again by the runtime.

---

## 7. Change preview (`preview.ts`)

The UX contract: users see the change before it happens. The preview is a list of
`PreviewChange`s (kind + human summary + affected ids) derived from the resolved
edits — never by executing them. The React panel renders it with colour-coded
badges (Add / Remove / Rename / Connect / Style / Group…), and **Approve /
Reject / Regenerate**. Approving applies the precomputed `OperationPlan`;
rejecting discards it. Nothing touches the runtime until Approve.

---

## 8. Orchestration & UX (`DiagramEditor.ts` + `src/features/ai/`)

`DiagramEditor` stages: Reading diagram → Planning edits → Resolving references →
Preparing preview → (approve) → Applying edits → Updating canvas. It streams,
cancels at any boundary (a cancel before Apply never mutates), self-heals a
malformed/unresolvable plan with a bounded re-prompt, and maps errors to clear
messages.

The editor UI is a single **intent-routed** assistant panel (`AssistantPanel`):
one prompt box classifies via the `IntentAnalyzer` — generate on an empty canvas,
edit otherwise — and renders either the generation flow or the edit
preview/clarify flow. `useDiagramEditing` exposes propose/accept/reject/
regenerate/retry/cancel + `chooseCandidate` for clarifications.

**Providers:** with a key, one real provider serves both capabilities. Without
one, a `MockAssistantProvider` routes by system prompt to `MockPlanProvider`
(generation) or `MockEditProvider` (a heuristic that reads the injected context +
prompt) — so the whole feature works with zero configuration.

---

## 9. Reversibility & safety

- Every applied edit is **one atomic transaction** (`origin: 'program'`) → a
  single `Ctrl/⌘+Z` undoes it; a failing operation rolls the whole edit back, so
  the diagram is never left half-changed.
- Ambiguous or invalid plans **never apply** — they clarify or reject first.
- The preview→approve gate means no surprise mutations.

Verified in-browser (CDP): generate a diagram → *"Add Redis between the API and
the Database"* shows a preview (Add "Redis", Connect API → Redis, Connect Redis →
Database), Approve adds exactly one node, *"delete the service"* raises a
clarification with the candidate services, and the result persists + undoes.

---

## 10. How this prepares Explain Mode & Diagram Review (next modules)

The reusable substrate is now complete:

- **DiagramUnderstanding** is exactly what Explain/Review need — a semantic model
  of nodes, edges, groups, hierarchy, and layout, renderer-free. Explain narrates
  it; Review analyzes it. Neither needs to touch the DSL or the canvas.
- **Reference resolution** lets Explain/Review talk about specific elements ("the
  Auth Service has no database connection") using the same "point → aim" machinery.
- **Read-only by construction:** Explain and Review produce *no* operations — they
  reuse the understanding + prompt + validation stages and simply stop before the
  ExecutionPlanner. The `IntentHandler` seam already routes `explain`/`review`;
  each is a handler with a prompt + response schema and **no `toOperations`**.
- **The clarification + preview patterns** generalize to Review's "suggested
  fixes" (preview a proposed change, apply on approval — identical to editing).

Generation proved plan → operations; editing proved understanding → references →
preview → safe mutation. Explain and Review are the read-only halves of the same
machine.
