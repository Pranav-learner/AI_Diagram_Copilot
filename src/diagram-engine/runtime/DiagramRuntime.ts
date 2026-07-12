/**
 * DiagramRuntime — the execution engine and the ONLY way to modify the DSL.
 *
 * Holds the document as immutable, versioned state (idempotent commits — the M3
 * loop-prevention backbone) and layers the operation system on top: `execute`,
 * `executeBatch`, `transaction`, `undo`/`redo`, plus `recordCanvasChange` (the
 * bridge's entry for manual edits). Every mutation flows through the pipeline
 * **validate → transaction → apply → commit → patch→history → events**; a failure
 * leaves the DSL untouched. Undo/redo replay reversible {@link DocumentPatch}es.
 *
 * Neither the UI nor future AI mutates the DSL directly — they call operations.
 */

import type { DiagramDocument, IdFactory, Clock, NodeTypeRegistry } from '@/dsl';
import { equals, createUuidIdFactory, systemClock, defaultNodeTypeRegistry } from '@/dsl';
import { RuntimeEventBus } from '../events/RuntimeEventBus';
import type { DiagramState, ChangeOrigin } from '../state/DiagramState';
import { initialState, nextState } from '../state/DiagramState';
import { HistoryManager } from '../history/HistoryManager';
import type { HistoryConfig } from '../history/HistoryManager';
import { TransactionManager } from '../transactions/TransactionManager';
import { RollbackManager } from '../transactions/RollbackManager';
import { OperationExecutor } from './OperationExecutor';
import { OperationValidator } from '../validation/OperationValidator';
import type { OperationRegistry, OperationParams } from './OperationRegistry';
import { createDefaultOperationRegistry } from '../operations';
import type { Operation, OperationContext } from '../operations/Operation';
import type { DocumentPatch } from '../patch/DocumentPatch';
import { diffToPatch, isEmptyPatch } from '../patch/DocumentPatch';
import { OperationError, TransactionError } from '../errors';

export interface DiagramRuntimeOptions {
  readonly ids?: IdFactory;
  readonly clock?: Clock;
  readonly nodeTypes?: NodeTypeRegistry;
  readonly operations?: OperationRegistry;
  readonly validator?: OperationValidator;
  readonly history?: HistoryConfig;
  readonly origin?: ChangeOrigin;
}

/** Result of an operation/batch: the resulting document and the applied delta. */
export interface OperationResult {
  readonly document: DiagramDocument;
  readonly patch: DocumentPatch;
}

export interface ExecuteOptions {
  readonly origin?: ChangeOrigin;
  readonly label?: string;
}

interface TransactionOptions extends ExecuteOptions {
  readonly coalesceKey?: string;
}

/** The handle passed to `transaction(fn)` — apply ops against the working doc. */
export interface TransactionScope {
  execute(op: Operation): OperationResult;
  executeBatch(ops: readonly Operation[]): OperationResult;
}

export class DiagramRuntime {
  readonly events = new RuntimeEventBus();

  private state: DiagramState;
  private readonly ids: IdFactory;
  private readonly clock: Clock;
  private readonly nodeTypes: NodeTypeRegistry;
  private readonly operationRegistry: OperationRegistry;
  private readonly executor: OperationExecutor;
  private readonly history: HistoryManager;
  private readonly transactions = new TransactionManager();
  private readonly rollbackManager = new RollbackManager();

  private readonly scope: TransactionScope = {
    execute: (op) => this.execute(op),
    executeBatch: (ops) => this.executeBatch(ops),
  };

  constructor(document: DiagramDocument, options: DiagramRuntimeOptions = {}) {
    this.state = initialState(document, options.origin ?? 'load');
    this.ids = options.ids ?? createUuidIdFactory();
    this.clock = options.clock ?? systemClock;
    this.nodeTypes = options.nodeTypes ?? defaultNodeTypeRegistry;
    this.operationRegistry = options.operations ?? createDefaultOperationRegistry();
    this.executor = new OperationExecutor(options.validator ?? new OperationValidator());
    this.history = new HistoryManager(options.history);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────
  getState(): DiagramState {
    return this.state;
  }
  getDocument(): DiagramDocument {
    return this.state.document;
  }
  getVersion(): number {
    return this.state.version;
  }
  get canUndo(): boolean {
    return this.history.canUndo;
  }
  get canRedo(): boolean {
    return this.history.canRedo;
  }

  subscribe(listener: (state: DiagramState) => void): () => void {
    return this.events.on('commit', ({ state }) => listener(state));
  }

  // ── Operation API (the mutation surface) ────────────────────────────────────

  /** Execute one operation. Records an undoable history entry when top-level. */
  execute(op: Operation, opts: ExecuteOptions = {}): OperationResult {
    if (this.transactions.active) return this.applyInTransaction(op);
    return this.transaction(() => this.applyInTransaction(op), {
      label: opts.label ?? op.label,
      origin: opts.origin,
      coalesceKey: op.coalesceKey,
    });
  }

  /** Execute an operation by registry type + params (for AI / serialized logs). */
  executeType(type: string, params: OperationParams = {}, opts: ExecuteOptions = {}): OperationResult {
    return this.execute(this.operationRegistry.create(type, params), opts);
  }

  /** Execute several operations atomically (one undo entry). */
  executeBatch(ops: readonly Operation[], opts: ExecuteOptions = {}): OperationResult {
    if (ops.length === 0) return { document: this.getDocument(), patch: {} };
    const nested = this.transactions.active;
    const before = nested ? this.transactions.current!.workingDocument : this.getDocument();
    this.transaction(
      (scope) => {
        for (const op of ops) scope.execute(op);
      },
      { label: opts.label ?? 'Batch', origin: opts.origin },
    );
    const after = nested ? this.transactions.current!.workingDocument : this.getDocument();
    return { document: after, patch: diffToPatch(before, after) };
  }

  /**
   * Run `fn` inside an atomic transaction. All operations succeed and commit as
   * one history entry, or any failure rolls the whole thing back. Nested-safe:
   * only the outermost transaction commits to the document + history.
   */
  transaction<T>(fn: (scope: TransactionScope) => T, opts: TransactionOptions = {}): T {
    const base = this.transactions.active ? this.transactions.current!.workingDocument : this.getDocument();
    const origin = opts.origin ?? this.transactions.current?.origin ?? 'program';
    const tx = this.transactions.begin(opts.label ?? 'Transaction', base, origin);
    this.events.emit('transaction:started', { id: tx.id });

    let value: T;
    try {
      value = fn(this.scope);
    } catch (error) {
      const reason = this.rollbackManager.rollback(this.transactions, tx, error);
      this.events.emit('transaction:rolled-back', { id: tx.id, reason });
      throw error instanceof Error ? error : new TransactionError(reason);
    }

    const ended = this.transactions.end();
    const finalDoc = ended?.workingDocument ?? base;
    const patch = diffToPatch(tx.baseDocument, finalDoc);

    if (this.transactions.active) {
      // Nested: fold the working document into the parent transaction.
      this.transactions.current!.workingDocument = finalDoc;
    } else if (!isEmptyPatch(patch)) {
      this.commitState(finalDoc, origin);
      this.history.record({ label: opts.label ?? tx.label, patch, coalesceKey: opts.coalesceKey });
      this.emitHistoryChanged();
    }
    this.events.emit('transaction:committed', { id: tx.id, label: tx.label, patch });
    return value;
  }

  // ── Undo / redo ─────────────────────────────────────────────────────────────

  undo(): boolean {
    const result = this.history.undo(this.getDocument());
    if (!result) return false;
    this.commitState(result.document, 'program');
    this.emitHistoryChanged();
    return true;
  }

  redo(): boolean {
    const result = this.history.redo(this.getDocument());
    if (!result) return false;
    this.commitState(result.document, 'program');
    this.emitHistoryChanged();
    return true;
  }

  // ── Canvas ingest (manual editing → operation-based history) ─────────────────

  /**
   * Record a document already produced by a manual canvas edit. Commits it
   * (origin `'canvas'`, so the bridge does not re-render) and pushes an undoable
   * history entry describing the change. No re-apply → no derivation drift.
   */
  recordCanvasChange(nextDoc: DiagramDocument): boolean {
    const before = this.getDocument();
    const patch = diffToPatch(before, nextDoc);
    if (isEmptyPatch(patch)) return false;
    this.commitState(nextDoc, 'canvas');
    const { label, coalesceKey } = describeCanvasPatch(patch);
    this.history.record({ label, patch, coalesceKey });
    this.emitHistoryChanged();
    return true;
  }

  // ── Low-level (compat / escape hatch) ────────────────────────────────────────

  /** Direct commit without an operation/history entry. Prefer `execute`. */
  commit(document: DiagramDocument, origin: ChangeOrigin): boolean {
    return this.commitState(document, origin);
  }

  mutate(fn: (current: DiagramDocument) => DiagramDocument, origin: ChangeOrigin = 'program'): boolean {
    return this.commitState(fn(this.getDocument()), origin);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private context(document: DiagramDocument): OperationContext {
    return { document, ids: this.ids, clock: this.clock, registry: this.nodeTypes };
  }

  private applyInTransaction(op: Operation): OperationResult {
    const tx = this.transactions.current;
    if (!tx) throw new TransactionError('No active transaction');
    this.events.emit('operation:started', { type: op.type, label: op.label });
    const result = this.executor.execute(op, this.context(tx.workingDocument));
    if (!result.ok) {
      this.events.emit('operation:failed', { type: op.type, label: op.label, issues: result.issues });
      throw new OperationError(op.type, result.issues);
    }
    tx.workingDocument = result.document;
    this.events.emit('operation:completed', { type: op.type, label: op.label, patch: result.patch });
    return { document: result.document, patch: result.patch };
  }

  private commitState(document: DiagramDocument, origin: ChangeOrigin): boolean {
    if (equals(document, this.state.document)) return false;
    const previous = this.state;
    this.state = nextState(previous, document, origin);
    this.events.emit('commit', { state: this.state, previous });
    this.events.emit('diagram:changed', { document, origin });
    return true;
  }

  private emitHistoryChanged(): void {
    this.events.emit('history:changed', {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoDepth: this.history.undoDepth,
      redoDepth: this.history.redoDepth,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
    });
  }
}

/** Derive a friendly label + coalesce key for a manual canvas edit's patch. */
function describeCanvasPatch(patch: DocumentPatch): { label: string; coalesceKey?: string } {
  const nodes = patch.nodes;
  // Single-node geometry change → coalesce consecutive drag flushes.
  if (
    nodes &&
    !patch.edges &&
    !patch.groups &&
    Object.keys(nodes.added).length === 0 &&
    Object.keys(nodes.removed).length === 0 &&
    Object.keys(nodes.changed).length === 1
  ) {
    const id = Object.keys(nodes.changed)[0]!;
    return { label: 'Edit node', coalesceKey: `canvas.node:${id}` };
  }
  if (nodes && Object.keys(nodes.added).length > 0 && !patch.edges) return { label: 'Add element' };
  if (nodes && Object.keys(nodes.removed).length > 0) return { label: 'Delete element' };
  if (patch.viewport && !patch.nodes && !patch.edges) return { label: 'Change viewport', coalesceKey: 'canvas.viewport' };
  return { label: 'Edit diagram' };
}
