/**
 * Shared types for the AI experience layer.
 *
 * An {@link AiTurn} is one request/response in the copilot conversation — the
 * unit the sidebar, timeline, and history all render. It aggregates state
 * observed from the existing systems (stages from the generator/editor, the
 * operation summary from the runtime, usage from the service); it never holds
 * business logic.
 */

import type { EditPreview, Clarification, TokenUsage, FormattedExplanation } from '@/ai';
import type { OperationSummary } from './lib/operationSummary';
import type { HumanError } from './lib/humanizeError';

export type TurnKind = 'generate' | 'edit' | 'explain';

export type TurnStatus =
  | 'streaming'
  | 'awaiting-approval'
  | 'clarifying'
  | 'applying'
  | 'done'
  | 'error'
  | 'cancelled';

export type StageState = 'pending' | 'active' | 'done' | 'error';

export interface TimelineStage {
  readonly key: string;
  readonly label: string;
  readonly state: StageState;
  readonly detail?: string;
}

export interface AiTurn {
  readonly id: string;
  readonly kind: TurnKind;
  readonly prompt: string;
  readonly intent: string;
  readonly confidence?: number;
  readonly createdAt: number;
  readonly status: TurnStatus;
  readonly stages: readonly TimelineStage[];
  /** Raw streamed model text (transparency / debug). */
  readonly streamingText: string;
  readonly planSummary?: string;
  readonly operationSummary?: OperationSummary;
  readonly warnings: readonly string[];
  readonly clarifications?: readonly Clarification[];
  readonly preview?: EditPreview;
  /** Present on `explain` turns: the formatted explanation to render. */
  readonly explanation?: FormattedExplanation;
  readonly error?: HumanError;
  readonly provider: string;
  readonly model: string;
  readonly tokens?: TokenUsage;
  readonly totalMs?: number;
  /** Runtime version before this turn applied — for "undo this change". */
  readonly baseVersion: number;
  readonly appliedVersion?: number;
}
