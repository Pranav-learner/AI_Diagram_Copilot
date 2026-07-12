/**
 * The runtime's event vocabulary — the operation/transaction/history lifecycle.
 *
 * Future AI, collaboration, and telemetry subscribe here to observe every
 * mutation without touching the runtime internals or the DSL. Every payload is
 * strongly typed.
 */

import type { DiagramDocument, Viewport } from '@/dsl';
import type { ChangeOrigin, DiagramState } from '../state/DiagramState';
import type { DocumentPatch } from '../patch/DocumentPatch';
import type { OperationIssue } from '../operations/Operation';

export const RuntimeEventName = {
  OperationStarted: 'operation:started',
  OperationCompleted: 'operation:completed',
  OperationFailed: 'operation:failed',
  TransactionStarted: 'transaction:started',
  TransactionCommitted: 'transaction:committed',
  TransactionRolledBack: 'transaction:rolled-back',
  HistoryChanged: 'history:changed',
  DiagramChanged: 'diagram:changed',
  SelectionChanged: 'selection:changed',
  ViewportChanged: 'viewport:changed',
} as const;

export type RuntimeEventName = (typeof RuntimeEventName)[keyof typeof RuntimeEventName];

/** The undo/redo availability snapshot delivered with `history:changed`. */
export interface HistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
}

export interface RuntimeEventMap {
  'operation:started': { readonly type: string; readonly label: string };
  'operation:completed': { readonly type: string; readonly label: string; readonly patch: DocumentPatch };
  'operation:failed': {
    readonly type: string;
    readonly label: string;
    readonly issues: readonly OperationIssue[];
    readonly error?: Error;
  };
  'transaction:started': { readonly id: number };
  'transaction:committed': { readonly id: number; readonly label: string; readonly patch: DocumentPatch };
  'transaction:rolled-back': { readonly id: number; readonly reason: string };
  'history:changed': HistorySnapshot;
  /** Low-level commit (carries previous+next state) — the bridge subscribes here. */
  'commit': { readonly state: DiagramState; readonly previous: DiagramState };
  'diagram:changed': { readonly document: DiagramDocument; readonly origin: ChangeOrigin };
  'selection:changed': { readonly ids: readonly string[] };
  'viewport:changed': { readonly viewport: Viewport };
}
