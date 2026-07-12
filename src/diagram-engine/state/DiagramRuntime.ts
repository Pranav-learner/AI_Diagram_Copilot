/**
 * DiagramRuntime — the live source of truth.
 *
 * Holds the current DSL {@link DiagramDocument} as immutable, versioned state and
 * commits new versions **idempotently**: a commit whose document equals the
 * current one is a no-op (returns `false`, emits nothing). This single rule is
 * the backbone of loop prevention — a canvas echo that reflects the current DSL
 * never produces a commit, so it can't trigger a re-render.
 *
 * The runtime is intentionally engine-agnostic: it knows nothing about scenes,
 * Excalidraw, or parsing. The {@link CanvasBridge} translates canvas ⇄ DSL and
 * calls `commit`/`mutate`; observers (autosave, future AI) subscribe to events.
 */

import type { DiagramDocument } from '@/dsl';
import { equals } from '@/dsl';
import { EventEmitter } from '../events/EventEmitter';
import type { DiagramState, ChangeOrigin } from './DiagramState';
import { initialState, nextState } from './DiagramState';

export interface RuntimeEventMap {
  /** Fired on every committed change with old + new state. */
  commit: { readonly state: DiagramState; readonly previous: DiagramState };
  /** Convenience: the new document and what caused it. */
  'document:changed': { readonly document: DiagramDocument; readonly origin: ChangeOrigin };
}

export class DiagramRuntime {
  readonly events = new EventEmitter<RuntimeEventMap>();
  private state: DiagramState;

  constructor(document: DiagramDocument, origin: ChangeOrigin = 'load') {
    this.state = initialState(document, origin);
  }

  getState(): DiagramState {
    return this.state;
  }

  getDocument(): DiagramDocument {
    return this.state.document;
  }

  getVersion(): number {
    return this.state.version;
  }

  /**
   * Commit a new document. Idempotent: returns `false` (no event) when the
   * document is structurally equal to the current one.
   */
  commit(document: DiagramDocument, origin: ChangeOrigin): boolean {
    if (equals(document, this.state.document)) return false;
    const previous = this.state;
    this.state = nextState(previous, document, origin);
    this.events.emit('commit', { state: this.state, previous });
    this.events.emit('document:changed', { document, origin });
    return true;
  }

  /** Programmatic edit: derive the next document from the current one. */
  mutate(
    fn: (current: DiagramDocument) => DiagramDocument,
    origin: ChangeOrigin = 'program',
  ): boolean {
    return this.commit(fn(this.state.document), origin);
  }

  /** Subscribe to committed changes. Returns an unsubscribe fn. */
  subscribe(listener: (state: DiagramState) => void): () => void {
    return this.events.on('commit', ({ state }) => listener(state));
  }
}
