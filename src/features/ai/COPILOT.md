# AI Copilot Experience Layer — Architecture

Phase 3, Module 4. This module adds **no new AI intelligence**. It transforms the
generation (M2) and conversational-editing (M3) capabilities into a polished,
transparent, recoverable AI copilot — a dedicated sidebar that feels like
ChatGPT/Cursor rather than an LLM bolted onto a diagram editor.

> **Architectural rule:** the experience layer stays separate from execution,
> planning, runtime, and rendering. It **consumes events and state** from the
> existing systems and never duplicates business logic.

Lives in `src/features/ai/`. The editor renders `<AiSidebar/>` inside
`<AIGenerationProvider/>` (within the DiagramRuntimeProvider).

---

## 1. What it consumes (never reimplements)

| Concern | Source (existing system) |
|---|---|
| Streaming stages / progress | `DiagramGenerator` / `DiagramEditor` observers (`onStage`, `onToken`) |
| Operation summary | the runtime's `transaction:committed` **DocumentPatch** |
| Intent routing | `RuleBasedIntentAnalyzer` (M1) |
| Preview / clarification | `DiagramEditor.propose` / `.disambiguate` (M3) |
| Undo / restore | `DiagramRuntime.undo()` (operation history) |
| Observability | `AIMetrics.snapshot()` (M1) |
| Context (what the AI sees) | `DiagramContextSource` + `understandDiagram` (M3) |

The layer's own code is state + presentation: stores, a summary derivation, an
error humanizer, an orchestration hook, and React components.

---

## 2. Conversation architecture

- **`useAiConversationStore`** (session-only) — a list of {@link AiTurn}s. A turn
  aggregates everything observed about one request: prompt, intent, status,
  timeline stages, streamed text, plan summary, operation summary, warnings,
  clarifications, preview, error, provider/model, tokens, timing, and the runtime
  `baseVersion`/`appliedVersion` (for undo). It is a dumb container.
- **`useAiCopilot`** — the single orchestration hook (the "brain" of the sidebar).
  It classifies intent, creates a turn, drives the generator/editor with an
  observer that streams stages/tokens into the turn, captures the runtime patch
  for the operation summary, and exposes the full action set: `send`, `approve`,
  `reject`, `chooseCandidate`, `retry`, `regenerate`, `editPrompt`, `restore`,
  `cancel`, `clearConversation`. It owns no business logic — it composes M1–M3.

Generation is one-phase (auto-applied); editing is two-phase (preview → approve),
so a turn can be `awaiting-approval` or `clarifying` before `done`.

---

## 3. Streaming & the Execution Timeline

Each turn carries an ordered `TimelineStage[]`: a synthetic **Intent** stage, then
the engine's real stages (Reading → Planning → Validating → Computing layout /
Resolving references → Executing → Rendering), then **Completed**. Every stage is
`pending | active | done | error`. `StageList` renders it live (streaming) and,
after completion, as the inspectable timeline (expandable per turn, with the raw
model output in debug mode). Not a spinner — meaningful, transparent stages.

---

## 4. Operation Summary (from the runtime)

`lib/operationSummary.ts` turns a `DocumentPatch` (emitted by the runtime on
`transaction:committed`) into human counts: nodes created/deleted/modified,
connections added/removed, groups created/removed, styles changed, plus the
measured execution time. `useAiCopilot` installs a scoped listener around each
apply, captures the (single, atomic) transaction patch, and summarizes it — so
the summary is the **authoritative runtime delta**, not a re-derivation.

---

## 5. History & Regeneration

The conversation *is* the history — each turn stores prompt, intent, plan
summary, operation summary, timestamp, provider, model, timing, and tokens, and
is re-runnable:

- **Retry** → re-run the same prompt as a new turn.
- **Regenerate** → undo this turn's change (if still latest) then re-run with a
  variation flag, so results don't stack.
- **Edit prompt** → load the prompt back into the composer.
- **Restore / Undo** → `runtime.undo()` (enabled only when the turn is the latest
  applied change — honest about the linear history).
- **Cancel** → abort the in-flight request (or discard a pending preview).

Regeneration preserves conversation context (prior turns remain).

---

## 6. Context, Settings, Prompts

- **Context inspector** — live diagram summary, selection, context size (tokens),
  and conversation length, read through the same `DiagramContextSource` the model
  uses (so it never drifts). Recomputes on runtime commits.
- **Settings** (`useAiSettingsStore`, persisted) — provider, model, temperature,
  max tokens, streaming, prompt version, debug. `settingsToConfigOverride` feeds
  the AIService config; the provider **rebuilds** on change. Includes a live
  session observability readout (requests, success rate, tokens, latency,
  retries, validation failures) from `AIMetrics`.
- **Prompt library** (`usePromptLibraryStore`, persisted) — reuse, duplicate,
  favorite, search, delete; export is a future placeholder. Successful prompts
  are auto-saved.

Persistence: settings + prompt library persist to `localStorage`; the
conversation is session-only (the phase excludes long-term memory).

---

## 7. Error Experience

`lib/humanizeError.ts` maps any `AIError` (config, timeout, rate limit, network,
validation, generation, edit, provider) to `{ message, suggestion, retryable,
technical }`. `ErrorCard` shows the human explanation + suggested fix + a retry
action + expandable technical detail (auto-expanded in debug mode). A cancelled
request is a gentle non-error state.

---

## 8. Accessibility & Performance

- **A11y:** the sidebar is a labelled `complementary` region; the conversation is
  a `role="log"` with `aria-live="polite"`; the streaming response region is
  `aria-live`/`aria-busy`; nav/actions have `aria-label`/`aria-pressed`/
  `aria-expanded`; the composer is keyboard-first (Enter to send, Shift+Enter for
  a newline) and everything is reachable/focusable.
- **Performance:** streaming appends into a single turn (no re-mount); the store
  updates are shallow; cancellation is a real `AbortSignal` through the service;
  the conversation is session-scoped; large diagrams are already truncated by the
  understanding layer; the sidebar is a fixed-width flex column that scrolls
  independently.

---

## 9. Why these decisions

1. **A turn-based store separate from `ConversationManager`.** The M1
   `ConversationManager` models raw message history; the copilot needs a
   *presentation* record (stages, summary, preview, timing). Keeping it in the
   experience layer avoids polluting the foundation with UX concerns.
2. **Operation summary from the patch, not the plan.** The runtime's committed
   delta is the truth; deriving from the plan would double the logic and could
   drift from what actually happened (cascades, rollbacks).
3. **One orchestration hook.** `useAiCopilot` replaced the two single-slot hooks +
   floating panel from M2/M3, removing duplicated UI logic (the module's
   "remove duplicated UI logic" requirement).
4. **Settings drive config, provider rebuilds.** The experience owns preferences;
   the foundation owns behaviour — a clean seam.

---

## 10. How this prepares Phase 4 (Explain Mode & Diagram Review)

The copilot surface is now capability-agnostic:

- **Turns render any capability.** A turn already holds an intent, stages, a
  streamed response, a summary, and actions. Explain/Review turns slot in as new
  `TurnKind`s (e.g. `explain`, `review`) — read-only, so they carry an
  explanation/finding list instead of an operation summary, reusing the same
  timeline, streaming, error, and history machinery.
- **Intent routing is ready.** `useAiCopilot` already classifies via the
  IntentAnalyzer; `explain`/`review` intents route to their handlers with no
  sidebar changes.
- **Preview → approve generalizes.** Review's "suggested fixes" reuse the exact
  preview/approve/undo pattern this module standardizes.
- **Transparency is the platform default now.** Explain's narration and Review's
  findings inherit the execution timeline, context inspector, observability, and
  error experience for free.

The result feels like a copilot: users converse, watch each request move through
transparent stages, see exactly what changed, and recover from anything — with
the reasoning (M1–M3) cleanly behind the experience.
