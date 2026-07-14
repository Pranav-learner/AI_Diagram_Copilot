import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { GENERATION_STAGES, EDIT_STAGES, EXPLAIN_STAGES, REVIEW_STAGES } from '@/ai';
import type { EditProposal, Clarification, Candidate, ExplanationSession, ExplainTarget, ExplainInput, ExplanationDepth, ReviewInput } from '@/ai';

/** Common shape of a generation/edit stage update (their `stage` unions differ). */
interface StageUpdateLike {
  readonly stage: string;
  readonly state: 'pending' | 'active' | 'done' | 'error';
  readonly detail?: string;
}
import type { DocumentPatch } from '@/diagram-engine';
import { AIGenerationContext } from './AIGenerationContext';
import { useAiConversationStore } from './store/useAiConversationStore';
import { useAiSettingsStore } from './store/useAiSettingsStore';
import { usePromptLibraryStore } from './store/usePromptLibraryStore';
import { summarizePatch } from './lib/operationSummary';
import { humanizeError } from './lib/humanizeError';
import type { AiTurn, TurnKind } from './types';

/**
 * The copilot orchestration hook — the single brain of the AI sidebar. It turns
 * user prompts into {@link AiTurn}s, drives the existing DiagramGenerator /
 * DiagramEditor, streams their stages/tokens into the conversation, and derives
 * each turn's operation summary from the runtime's committed patch. It owns NO
 * business logic — it composes and observes the systems built in M1–M3.
 */
export interface UseAiCopilot {
  readonly turns: readonly AiTurn[];
  readonly draft: string;
  readonly usingMock: boolean;
  readonly provider: string;
  readonly model: string;
  setDraft(value: string): void;
  send(prompt?: string): void;
  approve(turnId: string): void;
  reject(turnId: string): void;
  chooseCandidate(turnId: string, clarification: Clarification, candidate: Candidate): void;
  retry(turnId: string): void;
  regenerate(turnId: string): void;
  editPrompt(turnId: string): void;
  restore(turnId: string): void;
  cancel(turnId: string): void;
  clearConversation(): void;
  /** Whether a turn is the latest applied change (so "undo this" is meaningful). */
  canRestore(turnId: string): boolean;
  // ── Explain Mode ──────────────────────────────────────────────────────────
  /** Explain the current selection (or the whole diagram when nothing is selected). */
  explainSelection(): void;
  /** Explain one element by id (e.g. a related-element chip). */
  explainElement(id: string): void;
  /** Ask a follow-up scoped to an explanation turn's target + context. */
  askFollowUp(turnId: string, question: string): void;
  /** Re-explain an explanation turn's target at a different depth. */
  changeDepth(turnId: string, depth: ExplanationDepth): void;
  // ── Diagram Review ────────────────────────────────────────────────────────
  /** Review the whole diagram (or the current selection). */
  reviewDiagram(): void;
  /** Highlight a finding's affected elements on the canvas. */
  focusFinding(ids: readonly string[]): void;
}

export function useAiCopilot(): UseAiCopilot {
  const ctx = useContext(AIGenerationContext);
  if (!ctx) throw new Error('useAiCopilot must be used within an <AIGenerationProvider>.');
  const { generator, editor, explain, review, understanding, selectEntities, intentAnalyzer, contextSource, runtime, provider, model, usingMock } = ctx;

  const turns = useAiConversationStore((s) => s.turns);
  const store = useAiConversationStore;
  const streaming = useAiSettingsStore((s) => s.streaming);
  const savePrompt = usePromptLibraryStore((s) => s.add);

  const [draft, setDraft] = useState('');
  const controllers = useRef(new Map<string, AbortController>());
  const proposals = useRef(new Map<string, EditProposal>());
  const sessions = useRef(new Map<string, ExplanationSession>());

  // ── Runtime patch capture (operation summary source) ─────────────────────────
  const beginCapture = useCallback(() => {
    let last: DocumentPatch | undefined;
    const off = runtime.events.on('transaction:committed', ({ patch }) => {
      last = patch;
    });
    return { stop: () => { off(); return last; } };
  }, [runtime]);

  // ── Turn helpers ─────────────────────────────────────────────────────────────
  const makeObserver = useCallback(
    (turnId: string, kind: TurnKind) => {
      const stageDefs =
        kind === 'generate' ? GENERATION_STAGES : kind === 'explain' ? EXPLAIN_STAGES : kind === 'review' ? REVIEW_STAGES : EDIT_STAGES;
      const labelOf = (key: string) => stageDefs.find((s) => s.stage === key)?.label ?? key;
      return {
        onStage: (u: StageUpdateLike) =>
          store.getState().upsertStage(turnId, { key: u.stage, label: labelOf(u.stage), state: u.state, detail: u.detail }),
        onToken: (delta: string) => store.getState().appendToken(turnId, delta),
      };
    },
    [store],
  );

  const complete = useCallback(
    (turnId: string, extra: Partial<AiTurn>) => {
      store.getState().patchTurn(turnId, extra);
      store.getState().upsertStage(turnId, { key: 'completed', label: 'Completed', state: 'done' });
    },
    [store],
  );

  const fail = useCallback(
    (turnId: string, err: unknown) => {
      const human = humanizeError(err);
      // A cancellation is not an error state.
      if (err instanceof Error && err.name === 'CancelledError') {
        store.getState().patchTurn(turnId, { status: 'cancelled' });
        return;
      }
      store.getState().patchTurn(turnId, { status: 'error', error: human });
    },
    [store],
  );

  // ── Run a generation or edit for a turn ──────────────────────────────────────
  const runGeneration = useCallback(
    async (turnId: string, prompt: string, controller: AbortController, regenerate: boolean) => {
      const observer = makeObserver(turnId, 'generate');
      const capture = beginCapture();
      try {
        const result = await generator.generate({ prompt, regenerate, signal: controller.signal, stream: streaming }, observer);
        const patch = capture.stop();
        complete(turnId, {
          status: 'done',
          planSummary: result.plan.title,
          operationSummary: summarizePatch(patch, result.timings.totalMs),
          warnings: result.warnings.map((w) => w.message),
          tokens: result.usage,
          totalMs: result.timings.totalMs,
          appliedVersion: runtime.getVersion(),
        });
        savePrompt(prompt);
      } catch (err) {
        capture.stop();
        fail(turnId, err);
      } finally {
        controllers.current.delete(turnId);
      }
    },
    [generator, streaming, makeObserver, beginCapture, complete, fail, runtime, savePrompt],
  );

  const runEdit = useCallback(
    async (turnId: string, prompt: string, controller: AbortController, regenerate: boolean) => {
      const observer = makeObserver(turnId, 'edit');
      try {
        const proposal = await editor.propose({ prompt, regenerate, signal: controller.signal, stream: streaming }, observer);
        proposals.current.set(turnId, proposal);
        if (proposal.status === 'clarify') {
          store.getState().patchTurn(turnId, {
            status: 'clarifying',
            clarifications: proposal.clarifications,
            warnings: proposal.warnings.map((w) => w.message),
            tokens: proposal.usage,
          });
        } else {
          store.getState().patchTurn(turnId, {
            status: 'awaiting-approval',
            preview: proposal.preview,
            planSummary: proposal.plan.summary,
            warnings: proposal.warnings.map((w) => w.message),
            tokens: proposal.usage,
          });
        }
      } catch (err) {
        fail(turnId, err);
      } finally {
        controllers.current.delete(turnId);
      }
    },
    [editor, streaming, makeObserver, fail, store],
  );

  // ── Run an explanation (or a follow-up) for a turn ───────────────────────────
  const runExplain = useCallback(
    async (turnId: string, input: ExplainInput, controller: AbortController) => {
      const observer = makeObserver(turnId, 'explain');
      try {
        const result = await explain.explain({ ...input, signal: controller.signal, stream: streaming }, observer);
        sessions.current.set(turnId, result.session);
        complete(turnId, { status: 'done', explanation: result.explanation, planSummary: result.explanation.summary, tokens: result.usage });
      } catch (err) {
        fail(turnId, err);
      } finally {
        controllers.current.delete(turnId);
      }
    },
    [explain, streaming, makeObserver, complete, fail],
  );

  const runFollowUp = useCallback(
    async (turnId: string, session: ExplanationSession, question: string, controller: AbortController) => {
      const observer = makeObserver(turnId, 'explain');
      try {
        const result = await explain.followUp(session, question, observer, controller.signal);
        sessions.current.set(turnId, result.session);
        complete(turnId, { status: 'done', explanation: result.explanation, planSummary: result.explanation.summary, tokens: result.usage });
      } catch (err) {
        fail(turnId, err);
      } finally {
        controllers.current.delete(turnId);
      }
    },
    [explain, makeObserver, complete, fail],
  );

  /** Create + start an explain turn. Returns the turn id. */
  const startExplain = useCallback(
    (input: ExplainInput, promptLabel: string): string => {
      const turnId = newId();
      store.getState().addTurn({
        id: turnId,
        kind: 'explain',
        prompt: promptLabel,
        intent: 'explain',
        createdAt: Date.now(),
        status: 'streaming',
        stages: [{ key: 'intent', label: 'Intent', state: 'done', detail: 'explain' }],
        streamingText: '',
        warnings: [],
        provider,
        model,
        baseVersion: runtime.getVersion(),
      });
      const controller = new AbortController();
      controllers.current.set(turnId, controller);
      void runExplain(turnId, input, controller);
      return turnId;
    },
    [store, provider, model, runtime, runExplain],
  );

  const targetLabel = useCallback(
    (target: ExplainTarget): string => {
      const q = understanding.query();
      if (target.kind === 'node') return `Explain ${q.getEntity(target.id)?.label ?? 'element'}`;
      if (target.kind === 'group' || target.kind === 'container') return `Explain ${q.getGroup(target.id)?.label ?? 'group'}`;
      if (target.kind === 'diagram') return 'Explain the whole diagram';
      if (target.kind === 'selection') return `Explain the selection (${target.ids.length})`;
      return 'Explain';
    },
    [understanding],
  );

  // ── Run a diagram review for a turn ──────────────────────────────────────────
  const runReview = useCallback(
    async (turnId: string, input: ReviewInput, controller: AbortController) => {
      const observer = makeObserver(turnId, 'review');
      try {
        const result = await review.review({ ...input, signal: controller.signal, stream: streaming }, observer);
        complete(turnId, {
          status: 'done',
          review: result.review,
          planSummary: `${result.review.scores.overall.label}: ${result.review.scores.overall.score}/100 · ${result.review.counts.total} finding(s)`,
          tokens: result.usage,
        });
      } catch (err) {
        fail(turnId, err);
      } finally {
        controllers.current.delete(turnId);
      }
    },
    [review, streaming, makeObserver, complete, fail],
  );

  const startReview = useCallback(
    (input: ReviewInput, promptLabel: string): string => {
      const turnId = newId();
      store.getState().addTurn({
        id: turnId,
        kind: 'review',
        prompt: promptLabel,
        intent: 'review',
        createdAt: Date.now(),
        status: 'streaming',
        stages: [{ key: 'intent', label: 'Intent', state: 'done', detail: 'review' }],
        streamingText: '',
        warnings: [],
        provider,
        model,
        baseVersion: runtime.getVersion(),
      });
      const controller = new AbortController();
      controllers.current.set(turnId, controller);
      void runReview(turnId, input, controller);
      return turnId;
    },
    [store, provider, model, runtime, runReview],
  );

  // ── Public API ───────────────────────────────────────────────────────────────
  const send = useCallback(
    async (promptArg?: string) => {
      const prompt = (promptArg ?? draft).trim();
      if (!prompt) return;
      setDraft('');

      const doc = contextSource.getDocument();
      const hasDiagram = Object.keys(doc.nodes).length > 0;
      const selection = contextSource.getSelection?.() ?? [];
      const classification = await intentAnalyzer.analyze({ text: prompt, hasDiagram, hasSelection: selection.length > 0 });
      const kind: TurnKind =
        !hasDiagram || classification.intent === 'generate'
          ? 'generate'
          : classification.intent === 'explain'
            ? 'explain'
            : classification.intent === 'review'
              ? 'review'
              : 'edit';

      const turnId = newId();
      const turn: AiTurn = {
        id: turnId,
        kind,
        prompt,
        intent: kind,
        confidence: classification.confidence,
        createdAt: Date.now(),
        status: 'streaming',
        stages: [{ key: 'intent', label: 'Intent', state: 'done', detail: kind }],
        streamingText: '',
        warnings: [],
        provider,
        model,
        baseVersion: runtime.getVersion(),
      };
      store.getState().addTurn(turn);

      const controller = new AbortController();
      controllers.current.set(turnId, controller);
      if (kind === 'generate') void runGeneration(turnId, prompt, controller, false);
      else if (kind === 'explain') {
        const target: ExplainTarget =
          selection.length === 1 ? { kind: 'node', id: selection[0]! } : selection.length > 1 ? { kind: 'selection', ids: selection } : { kind: 'diagram' };
        void runExplain(turnId, { target, question: prompt }, controller);
      } else if (kind === 'review') {
        void runReview(turnId, { ...(selection.length > 0 ? { scope: { kind: 'selection', ids: selection } } : {}), request: prompt }, controller);
      } else void runEdit(turnId, prompt, controller, false);
    },
    [draft, contextSource, intentAnalyzer, provider, model, runtime, store, runGeneration, runEdit, runExplain, runReview],
  );

  const reviewDiagram = useCallback(() => {
    const selection = contextSource.getSelection?.() ?? [];
    const scoped = selection.length > 0;
    startReview(scoped ? { scope: { kind: 'selection', ids: selection } } : {}, scoped ? `Review ${selection.length} selected element(s)` : 'Review the whole diagram');
  }, [contextSource, startReview]);

  const focusFinding = useCallback((ids: readonly string[]) => selectEntities(ids), [selectEntities]);

  const explainSelection = useCallback(() => {
    const selection = contextSource.getSelection?.() ?? [];
    const target: ExplainTarget =
      selection.length === 1 ? { kind: 'node', id: selection[0]! } : selection.length > 1 ? { kind: 'selection', ids: selection } : { kind: 'diagram' };
    startExplain({ target }, targetLabel(target));
  }, [contextSource, startExplain, targetLabel]);

  const explainElement = useCallback(
    (id: string) => {
      const target: ExplainTarget = understanding.query().getGroup(id) ? { kind: 'group', id } : { kind: 'node', id };
      startExplain({ target }, targetLabel(target));
    },
    [understanding, startExplain, targetLabel],
  );

  const askFollowUp = useCallback(
    (turnId: string, question: string) => {
      const session = sessions.current.get(turnId);
      if (!session) return;
      const newTurnId = newId();
      store.getState().addTurn({
        id: newTurnId,
        kind: 'explain',
        prompt: question,
        intent: 'explain',
        createdAt: Date.now(),
        status: 'streaming',
        stages: [{ key: 'intent', label: 'Intent', state: 'done', detail: 'follow-up' }],
        streamingText: '',
        warnings: [],
        provider,
        model,
        baseVersion: runtime.getVersion(),
      });
      const controller = new AbortController();
      controllers.current.set(newTurnId, controller);
      void runFollowUp(newTurnId, session, question, controller);
    },
    [store, provider, model, runtime, runFollowUp],
  );

  const changeDepth = useCallback(
    (turnId: string, depth: ExplanationDepth) => {
      const session = sessions.current.get(turnId);
      if (!session) return;
      const target = session.request.target;
      startExplain({ target, depth }, `${targetLabel(target)} (${depth})`);
    },
    [startExplain, targetLabel],
  );

  const approve = useCallback(
    (turnId: string) => {
      const proposal = proposals.current.get(turnId);
      if (!proposal || proposal.status !== 'preview') return;
      store.getState().patchTurn(turnId, { status: 'applying' });
      store.getState().upsertStage(turnId, { key: 'executing', label: 'Applying', state: 'active' });
      const capture = beginCapture();
      const start = Date.now();
      try {
        editor.apply(proposal, makeObserver(turnId, 'edit'));
        const patch = capture.stop();
        complete(turnId, {
          status: 'done',
          operationSummary: summarizePatch(patch, Date.now() - start),
          appliedVersion: runtime.getVersion(),
        });
        proposals.current.delete(turnId);
        savePrompt(store.getState().turns.find((t) => t.id === turnId)?.prompt ?? '');
      } catch (err) {
        capture.stop();
        fail(turnId, err);
      }
    },
    [editor, makeObserver, beginCapture, complete, fail, runtime, store, savePrompt],
  );

  const reject = useCallback(
    (turnId: string) => {
      proposals.current.delete(turnId);
      store.getState().patchTurn(turnId, { status: 'cancelled' });
    },
    [store],
  );

  const chooseCandidate = useCallback(
    (turnId: string, clarification: Clarification, candidate: Candidate) => {
      const proposal = proposals.current.get(turnId);
      if (!proposal) return;
      try {
        const next = editor.disambiguate(proposal, [
          { editIndex: clarification.editIndex, reference: clarification.reference, id: candidate.id },
        ]);
        proposals.current.set(turnId, next);
        if (next.status === 'clarify') {
          store.getState().patchTurn(turnId, { status: 'clarifying', clarifications: next.clarifications });
        } else {
          store.getState().patchTurn(turnId, {
            status: 'awaiting-approval',
            preview: next.preview,
            clarifications: undefined,
            planSummary: next.plan.summary,
            warnings: next.warnings.map((w) => w.message),
          });
        }
      } catch (err) {
        fail(turnId, err);
      }
    },
    [editor, fail, store],
  );

  const turnById = useCallback((turnId: string) => store.getState().turns.find((t) => t.id === turnId), [store]);

  const canRestore = useCallback(
    (turnId: string) => {
      const turn = turnById(turnId);
      return Boolean(turn && turn.appliedVersion !== undefined && turn.appliedVersion === runtime.getVersion() && runtime.canUndo);
    },
    [turnById, runtime],
  );

  const restore = useCallback(
    (turnId: string) => {
      if (!canRestore(turnId)) return;
      runtime.undo();
      store.getState().patchTurn(turnId, { status: 'cancelled' });
    },
    [canRestore, runtime, store],
  );

  const retry = useCallback(
    (turnId: string) => {
      const turn = turnById(turnId);
      if (!turn) return;
      if (turn.kind === 'explain') {
        const session = sessions.current.get(turnId);
        if (session) startExplain({ target: session.request.target, depth: session.request.depth }, targetLabel(session.request.target));
        return;
      }
      void send(turn.prompt);
    },
    [turnById, send, startExplain, targetLabel],
  );

  const regenerate = useCallback(
    (turnId: string) => {
      const turn = turnById(turnId);
      if (!turn) return;
      if (turn.kind === 'explain' || turn.kind === 'review') return retry(turnId);
      // Undo this turn's change first (if it's still the latest) so we don't stack.
      if (canRestore(turnId)) runtime.undo();
      const prompt = turn.prompt;
      const controller = new AbortController();
      const newTurnId = newId();
      store.getState().addTurn({
        id: newTurnId,
        kind: turn.kind,
        prompt,
        intent: turn.intent,
        confidence: turn.confidence,
        createdAt: Date.now(),
        status: 'streaming',
        stages: [{ key: 'intent', label: 'Intent', state: 'done', detail: turn.intent }],
        streamingText: '',
        warnings: [],
        provider,
        model,
        baseVersion: runtime.getVersion(),
      });
      controllers.current.set(newTurnId, controller);
      if (turn.kind === 'generate') void runGeneration(newTurnId, prompt, controller, true);
      else void runEdit(newTurnId, prompt, controller, true);
    },
    [turnById, retry, canRestore, runtime, provider, model, store, runGeneration, runEdit],
  );

  const editPrompt = useCallback(
    (turnId: string) => {
      const turn = turnById(turnId);
      if (turn) setDraft(turn.prompt);
    },
    [turnById],
  );

  const cancel = useCallback(
    (turnId: string) => {
      const controller = controllers.current.get(turnId);
      if (controller) controller.abort();
      else reject(turnId); // not running (awaiting approval/clarify) → discard
    },
    [reject],
  );

  const clearConversation = useCallback(() => {
    for (const c of controllers.current.values()) c.abort();
    controllers.current.clear();
    proposals.current.clear();
    sessions.current.clear();
    store.getState().clear();
  }, [store]);

  return useMemo(
    () => ({
      turns,
      draft,
      usingMock,
      provider,
      model,
      setDraft,
      send,
      approve,
      reject,
      chooseCandidate,
      retry,
      regenerate,
      editPrompt,
      restore,
      cancel,
      clearConversation,
      canRestore,
      explainSelection,
      explainElement,
      askFollowUp,
      changeDepth,
      reviewDiagram,
      focusFinding,
    }),
    [turns, draft, usingMock, provider, model, send, approve, reject, chooseCandidate, retry, regenerate, editPrompt, restore, cancel, clearConversation, canRestore, explainSelection, explainElement, askFollowUp, changeDepth, reviewDiagram, focusFinding],
  );
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `turn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
