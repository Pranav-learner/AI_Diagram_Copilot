/**
 * LiveSynchronizer — the guarded canvas ⇄ DSL translator.
 *
 * Two directions, each with loop guards:
 *  - `fromCanvas(scene)`: parse the scene, **merge** it into the current document
 *    (preserving doc-level entities that basic canvas editing can't touch), and
 *    commit — dropping echoes via the lock, the scene signature, and finally DSL
 *    idempotency.
 *  - `toCanvas(prev, next)`: `engine.sync` a minimal, reference-stable scene and
 *    apply it under the lock, pre-recording its signature so the resulting echo is
 *    recognized.
 *
 * Guard ordering matters: cheapest first (lock → signature) then authoritative
 * (idempotent commit). Any one of them alone terminates a cycle; together they
 * make it impossible.
 */

import type { DiagramDocument } from '@/dsl';
import type { RenderingEngine } from '../renderer/RenderingEngine';
import type { EventEmitter } from '../events/EventEmitter';
import type { CanvasPort } from '../bridge/CanvasPort';
import type { BridgeEventMap } from '../bridge/BridgeEvents';
import { BridgeEventName } from '../bridge/BridgeEvents';
import type { DiagramRuntime } from '../runtime/DiagramRuntime';
import type { TransactionManager } from './TransactionManager';
import type { VersionManager } from './VersionManager';

export interface LiveSynchronizerDeps<TScene> {
  readonly engine: RenderingEngine;
  readonly runtime: DiagramRuntime;
  readonly port: CanvasPort<TScene>;
  readonly transactions: TransactionManager;
  readonly versions: VersionManager;
  readonly events: EventEmitter<BridgeEventMap>;
  /** Cheap echo signature of a scene (e.g. Excalidraw sceneVersion + hash). */
  readonly signature: (scene: TScene) => string;
  readonly rendererId?: string;
  /** Holds the apply-lock across an async echo window; sync release if absent. */
  readonly settleScheduler?: (release: () => void) => void;
}

/**
 * Merge a parsed-from-canvas document into the current one. Node/edge/viewport
 * come from the canvas (element `customData` escrow survives an Excalidraw round
 * trip, so DSL identity is intact). Doc-level collections are taken from the
 * parse only when the appState escrow survived (detected by the document id
 * round-tripping); otherwise they're preserved from the current document.
 *
 * `updatedAt` is document metadata, not a canvas-derived value: when the appState
 * escrow was lost (the live Excalidraw case), `parse` fabricates a fresh
 * timestamp, so we keep the current one — otherwise merely *opening* a diagram
 * would dirty it and trigger a spurious save.
 */
export function mergeCanvasIntoDocument(
  current: DiagramDocument,
  parsed: DiagramDocument,
): DiagramDocument {
  const escrowSurvived = parsed.id === current.id;
  return {
    ...current,
    nodes: parsed.nodes,
    edges: parsed.edges,
    viewport: parsed.viewport,
    groups: escrowSurvived ? parsed.groups : current.groups,
    layers: escrowSurvived ? parsed.layers : current.layers,
    styles: escrowSurvived ? parsed.styles : current.styles,
    tags: escrowSurvived ? parsed.tags : current.tags,
    annotations: escrowSurvived ? parsed.annotations : current.annotations,
    comments: escrowSurvived ? parsed.comments : current.comments,
    updatedAt: escrowSurvived ? parsed.updatedAt : current.updatedAt,
  };
}

export class LiveSynchronizer<TScene> {
  constructor(private readonly deps: LiveSynchronizerDeps<TScene>) {}

  /** Canvas → DSL. Returns true iff a genuine change was committed. */
  fromCanvas(scene: TScene): boolean {
    const { transactions, versions, events, runtime, engine, signature, rendererId } = this.deps;

    if (transactions.isApplying) {
      events.emit(BridgeEventName.EchoDropped, { reason: 'lock' });
      return false;
    }
    const sig = signature(scene);
    if (versions.isEcho(sig)) {
      events.emit(BridgeEventName.EchoDropped, { reason: 'signature' });
      return false;
    }

    const parsed = engine.parse<TScene, unknown>(scene, rendererId).document;
    const merged = mergeCanvasIntoDocument(runtime.getDocument(), parsed);
    // Route the manual edit through the runtime so it becomes an undoable,
    // operation-based history entry (commit origin 'canvas' → no re-render).
    const committed = runtime.recordCanvasChange(merged);
    if (!committed) {
      events.emit(BridgeEventName.EchoDropped, { reason: 'idempotent' });
      return false;
    }

    versions.bump();
    versions.markApplied(sig);
    events.emit(BridgeEventName.DslCommitted, {
      document: merged,
      version: runtime.getVersion(),
      origin: 'canvas',
    });
    return true;
  }

  /** DSL → canvas. Applies a minimal, reference-stable update under the lock. */
  toCanvas(prevDoc: DiagramDocument, nextDoc: DiagramDocument): void {
    const { engine, port, transactions, versions, events, signature, rendererId } = this.deps;

    const current = port.getScene();
    const result = engine.sync<TScene, unknown>(prevDoc, nextDoc, current, rendererId);
    const changed =
      result.changeSet.added.length +
      result.changeSet.updated.length +
      result.changeSet.removed.length;

    const txn = transactions.begin('program');
    versions.markApplied(signature(result.scene));
    const release = transactions.lock();
    try {
      // Program renders (undo/redo, AI) must not enter Excalidraw's native
      // history — the runtime owns history now.
      port.applyScene(result.scene, { captureHistory: false });
    } finally {
      if (this.deps.settleScheduler) this.deps.settleScheduler(release);
      else release();
    }
    events.emit(BridgeEventName.RenderApplied, { transactionId: txn.id, changed });
  }
}
