/**
 * DiagramEditor — the conversational-editing orchestrator.
 *
 * Unlike generation, editing is **two-phase**: `propose()` reads the diagram,
 * plans edits, resolves references, and returns a **preview** (or a
 * clarification) WITHOUT touching the runtime; `apply()` executes an approved
 * proposal. This is the safety spine — users see and approve what the AI intends
 * before anything changes, ambiguous references become questions (never
 * guesses), and every applied edit is one atomic, undoable transaction.
 *
 * Stages: Reading diagram → Planning edits → Resolving references → Preparing
 * preview → (approve) → Applying edits → Updating canvas.
 */

import type { AIService } from '../core/AIService';
import type { ChatMessage, TokenUsage } from '../core/types';
import { ZERO_USAGE } from '../core/types';
import { CancelledError } from '../core/AIError';
import { PromptBuilder } from '../planning/PromptBuilder';
import type { TemplateRef } from '../planning/PromptBuilder';
import type { DiagramContextSource } from '../planning/ContextBuilder';
import { ResponseValidator } from '../validation/ResponseValidator';
import type { DiagramGateway, OperationApplyResult } from '../planning/OperationPlanner';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import { EditPlanSchema, referenceEquals } from './model/EditPlan';
import type { EditOp, EditPlan, ElementReference } from './model/EditPlan';
import { understandDiagram, renderUnderstanding } from './DiagramUnderstanding';
import type { DiagramUnderstanding } from './DiagramUnderstanding';
import { EditExecutionPlanner } from './EditExecutionPlanner';
import { validateEditPlan, detectConflicts } from './validateEditPlan';
import type { EditIssue, Clarification } from './clarification';
import type { EditPreview } from './preview';
import { EditError } from './errors';
import type { EditPhase } from './errors';
import { EDIT_PROMPT_ID, buildEditUserPrompt, registerEditPrompts } from './prompts/editPrompts';

export const EDIT_STAGES = [
  { stage: 'understanding', label: 'Reading diagram' },
  { stage: 'planning', label: 'Planning edits' },
  { stage: 'validating', label: 'Resolving references' },
  { stage: 'preview', label: 'Preparing preview' },
  { stage: 'executing', label: 'Applying edits' },
  { stage: 'rendering', label: 'Updating canvas' },
] as const satisfies ReadonlyArray<{ stage: EditPhase; label: string }>;

/** Local to editing (generation exports its own `StageState`); kept unexported. */
type StageState = 'pending' | 'active' | 'done' | 'error';

export interface EditStageUpdate {
  readonly stage: EditPhase;
  readonly state: 'pending' | 'active' | 'done' | 'error';
  readonly detail?: string;
}

export interface EditObserver {
  onStage?(update: EditStageUpdate): void;
  onToken?(delta: string): void;
}

export interface EditRequest {
  readonly prompt: string;
  readonly signal?: AbortSignal;
  readonly regenerate?: boolean;
  /** A disambiguation note pinning an ambiguous reference to a chosen element. */
  readonly disambiguation?: string;
  readonly stream?: boolean;
}

export type EditProposalStatus = 'preview' | 'clarify';

export interface EditProposal {
  readonly status: EditProposalStatus;
  readonly plan: EditPlan;
  /** Present when status is 'preview'. */
  readonly preview?: EditPreview;
  /** Present when status is 'preview' — the compiled, ready-to-apply operations. */
  readonly operations?: OperationPlan;
  /** Present when status is 'clarify'. */
  readonly clarifications: readonly Clarification[];
  readonly warnings: readonly EditIssue[];
  readonly usage: TokenUsage;
  readonly understanding: DiagramUnderstanding;
  /** The originating request, for regenerate/disambiguation follow-ups. */
  readonly request: EditRequest;
}

export interface ApplyResult {
  readonly applied: OperationApplyResult;
  readonly preview: EditPreview;
}

/** A user's answer to a clarification: pin `reference` in edit `editIndex` to `id`. */
export interface DisambiguationChoice {
  readonly editIndex: number;
  readonly reference: ElementReference;
  readonly id: string;
}

/** Recursively replace references in an edit that match a chosen one with a concrete id. */
function substituteReferences(edit: EditOp, choices: readonly DisambiguationChoice[]): EditOp {
  const replace = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.by === 'string') {
        const ref = obj as unknown as ElementReference;
        const choice = choices.find((c) => referenceEquals(c.reference, ref));
        if (choice) return { by: 'id', id: choice.id };
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) out[k] = replace(v);
      return out;
    }
    return value;
  };
  return replace(edit) as EditOp;
}

export interface DiagramEditorDeps {
  readonly service: AIService;
  readonly gateway: DiagramGateway;
  readonly contextSource: DiagramContextSource;
  readonly promptBuilder?: PromptBuilder;
  readonly validator?: ResponseValidator;
  readonly executionPlanner?: EditExecutionPlanner;
  readonly promptRef?: TemplateRef;
  readonly maxPlanAttempts?: number;
  readonly now?: () => number;
  readonly stream?: boolean;
}

export class DiagramEditor {
  private readonly service: AIService;
  private readonly gateway: DiagramGateway;
  private readonly contextSource: DiagramContextSource;
  private readonly promptBuilder: PromptBuilder;
  private readonly validator: ResponseValidator;
  private readonly executionPlanner: EditExecutionPlanner;
  private readonly promptRef: TemplateRef;
  private readonly maxPlanAttempts: number;
  private readonly streamByDefault: boolean;

  constructor(deps: DiagramEditorDeps) {
    this.service = deps.service;
    this.gateway = deps.gateway;
    this.contextSource = deps.contextSource;
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
    if (!this.promptBuilder.registryRef.has(EDIT_PROMPT_ID)) registerEditPrompts(this.promptBuilder.registryRef);
    this.validator = deps.validator ?? new ResponseValidator({ metrics: deps.service.metrics });
    this.executionPlanner = deps.executionPlanner ?? new EditExecutionPlanner();
    this.promptRef = deps.promptRef ?? { id: EDIT_PROMPT_ID };
    this.maxPlanAttempts = Math.max(1, deps.maxPlanAttempts ?? 2);
    this.streamByDefault = deps.stream ?? true;
  }

  /** Plan an edit and return a preview (or a clarification). Does NOT mutate. */
  async propose(request: EditRequest, observer: EditObserver = {}): Promise<EditProposal> {
    let currentStage: EditPhase = 'understanding';
    const stage = (s: EditPhase, state: StageState, detail?: string) => {
      currentStage = s;
      observer.onStage?.({ stage: s, state, detail });
    };
    const ensureLive = () => {
      if (request.signal?.aborted) throw new CancelledError();
    };

    try {
      // ── Reading diagram ────────────────────────────────────────────────────
      stage('understanding', 'active');
      ensureLive();
      const understanding = understandDiagram(this.contextSource);
      if (understanding.counts.nodes === 0) {
        throw new EditError('There is nothing to edit yet — generate or draw a diagram first.', 'understanding');
      }
      const contextBlock = renderUnderstanding(understanding);
      stage('understanding', 'done', `${understanding.counts.nodes} nodes`);

      // ── Planning + validating (with bounded self-heal) ─────────────────────
      let usage: TokenUsage = ZERO_USAGE;
      let correction: string | undefined;

      for (let attempt = 0; attempt < this.maxPlanAttempts; attempt++) {
        ensureLive();
        stage('planning', 'active', attempt > 0 ? `retry ${attempt}` : undefined);
        const user = buildEditUserPrompt(request.prompt, {
          selectionCount: understanding.selection.length,
          regenerate: request.regenerate,
          disambiguation: request.disambiguation,
          correction,
        });
        const messages = this.promptBuilder.build({ template: this.promptRef, user, contextBlock });
        const completion = await this.runModel(messages, request, observer);
        usage = completion.usage;
        stage('planning', 'done');

        stage('validating', 'active');
        const outcome = this.validateAndCompile(completion.text, understanding);
        if (!outcome.ok) {
          correction = outcome.correction;
          if (attempt + 1 >= this.maxPlanAttempts) {
            stage('validating', 'error', outcome.correction);
            throw new EditError('The edit plan could not be resolved against this diagram.', 'validating', outcome.issues);
          }
          stage('validating', 'done', 'invalid — retrying');
          continue;
        }

        // Ambiguity → ask, don't execute.
        if (outcome.clarifications.length > 0) {
          stage('validating', 'done', 'needs clarification');
          return {
            status: 'clarify',
            plan: outcome.plan,
            clarifications: outcome.clarifications,
            warnings: outcome.warnings,
            usage,
            understanding,
            request,
          };
        }

        stage('validating', 'done', outcome.warnings.length ? `${outcome.warnings.length} warning(s)` : undefined);

        // ── Preparing preview ────────────────────────────────────────────────
        stage('preview', 'active');
        stage('preview', 'done', outcome.preview.operationCount ? `${outcome.preview.operationCount} operations` : undefined);
        return {
          status: 'preview',
          plan: outcome.plan,
          preview: outcome.preview,
          operations: outcome.operations,
          clarifications: [],
          warnings: outcome.warnings,
          usage,
          understanding,
          request,
        };
      }

      // Unreachable: the loop returns or throws.
      throw new EditError('Failed to produce an edit plan.', 'planning');
    } catch (error) {
      observer.onStage?.({ stage: currentStage, state: 'error', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /** Apply an approved proposal to the runtime as one atomic, undoable edit. */
  apply(proposal: EditProposal, observer: EditObserver = {}): ApplyResult {
    if (proposal.status !== 'preview' || !proposal.operations || !proposal.preview) {
      throw new EditError('This proposal cannot be applied (it needs clarification).', 'executing');
    }
    observer.onStage?.({ stage: 'executing', state: 'active' });
    let applied: OperationApplyResult;
    try {
      applied = this.gateway.apply(proposal.operations);
    } catch (error) {
      observer.onStage?.({ stage: 'executing', state: 'error', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    observer.onStage?.({ stage: 'executing', state: 'done', detail: `${applied.applied} operations` });
    observer.onStage?.({ stage: 'rendering', state: 'active' });
    observer.onStage?.({ stage: 'rendering', state: 'done' });
    return { applied, preview: proposal.preview };
  }

  /**
   * Resolve a clarification by pinning ambiguous references to chosen elements,
   * then recompile — no extra model call, so it works with any provider. Returns
   * a fresh proposal (a preview, or another clarification if more remain).
   */
  disambiguate(proposal: EditProposal, choices: readonly DisambiguationChoice[]): EditProposal {
    const edits = proposal.plan.edits.map((edit, i) => {
      const relevant = choices.filter((c) => c.editIndex === i);
      return relevant.length ? substituteReferences(edit, relevant) : edit;
    });
    const plan: EditPlan = { ...proposal.plan, edits };

    const structural = validateEditPlan(plan);
    const compiled = this.executionPlanner.compile(plan, proposal.understanding);
    const hard = compiled.issues.filter((i) => i.severity === 'error');
    if (hard.length > 0) throw new EditError('Could not resolve the clarified edit.', 'validating', hard);

    const warnings = [...structural.warnings, ...compiled.issues.filter((i) => i.severity === 'warning'), ...detectConflicts(compiled.preview)];
    if (compiled.clarifications.length > 0) {
      return { ...proposal, status: 'clarify', plan, clarifications: compiled.clarifications, warnings, preview: undefined, operations: undefined };
    }
    return { ...proposal, status: 'preview', plan, preview: compiled.preview, operations: compiled.operations, clarifications: [], warnings };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async runModel(
    messages: readonly ChatMessage[],
    request: EditRequest,
    observer: EditObserver,
  ): Promise<{ text: string; usage: TokenUsage }> {
    const opts = { signal: request.signal, tier: 'reasoning' as const, intent: 'edit' };
    if (!(request.stream ?? this.streamByDefault)) {
      const response = await this.service.complete({ messages, responseFormat: { type: 'json' } }, opts);
      observer.onToken?.(response.text);
      return { text: response.text, usage: response.usage };
    }
    let text = '';
    let usage: TokenUsage = ZERO_USAGE;
    for await (const chunk of this.service.stream({ messages, responseFormat: { type: 'json' } }, opts)) {
      if (chunk.delta) {
        text += chunk.delta;
        observer.onToken?.(chunk.delta);
      }
      if (chunk.usage) usage = chunk.usage;
    }
    return { text, usage };
  }

  /** Validate + compile an EditPlan. Returns ready (with preview/clarifications) or invalid (for retry). */
  private validateAndCompile(
    text: string,
    understanding: DiagramUnderstanding,
  ):
    | {
        ok: true;
        plan: EditPlan;
        operations: OperationPlan;
        preview: EditPreview;
        clarifications: readonly Clarification[];
        warnings: readonly EditIssue[];
      }
    | { ok: false; correction: string; issues: readonly EditIssue[] } {
    const minConfidence = this.service.config.validation.minConfidence;
    const parsed = this.validator.validate(text, EditPlanSchema, { minConfidence });
    if (!parsed.ok) {
      return { ok: false, correction: parsed.issues.map((i) => `- ${i.path ?? '<root>'}: ${i.message}`).join('\n'), issues: [] };
    }

    const structural = validateEditPlan(parsed.value);
    if (!structural.ok) {
      return { ok: false, correction: structural.errors.map((i) => `- ${i.message}`).join('\n'), issues: structural.errors };
    }

    const compiled = this.executionPlanner.compile(parsed.value, understanding);
    const hardIssues = compiled.issues.filter((i) => i.severity === 'error');
    if (hardIssues.length > 0) {
      return { ok: false, correction: hardIssues.map((i) => `- ${i.message}`).join('\n'), issues: hardIssues };
    }

    const warnings = [
      ...structural.warnings,
      ...compiled.issues.filter((i) => i.severity === 'warning'),
      ...detectConflicts(compiled.preview),
    ];
    return {
      ok: true,
      plan: parsed.value,
      operations: compiled.operations,
      preview: compiled.preview,
      clarifications: compiled.clarifications,
      warnings,
    };
  }
}
