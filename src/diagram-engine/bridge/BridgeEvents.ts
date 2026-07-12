/**
 * Bridge event vocabulary.
 *
 * The bridge emits strongly-typed events at each stage of the sync pipeline so
 * observers (autosave, telemetry, future AI) can watch the flow without touching
 * internals. `echo-dropped` is especially useful: it tells you loop prevention is
 * doing its job (and via which guard).
 */

import type { DiagramDocument } from '@/dsl';
import type { ChangeOrigin } from '../state/DiagramState';

export const BridgeEventName = {
  CanvasChanged: 'bridge:canvas-changed',
  DslCommitted: 'bridge:dsl-committed',
  RenderApplied: 'bridge:render-applied',
  EchoDropped: 'bridge:echo-dropped',
  SelectionChanged: 'bridge:selection-changed',
  Error: 'bridge:error',
} as const;

export type BridgeEventName = (typeof BridgeEventName)[keyof typeof BridgeEventName];

/** Why an incoming canvas change was recognized as an echo and dropped. */
export type EchoReason = 'lock' | 'signature' | 'idempotent';

export interface BridgeEventMap {
  'bridge:canvas-changed': { readonly committed: boolean };
  'bridge:dsl-committed': {
    readonly document: DiagramDocument;
    readonly version: number;
    readonly origin: ChangeOrigin;
  };
  'bridge:render-applied': { readonly transactionId: number; readonly changed: number };
  'bridge:echo-dropped': { readonly reason: EchoReason };
  'bridge:selection-changed': { readonly ids: readonly string[] };
  'bridge:error': { readonly error: Error };
}
