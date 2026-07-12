/**
 * HistoryManager — operation-based undo/redo over reversible {@link DocumentPatch}es.
 *
 * Each entry is a compact delta (not a document snapshot), so history is
 * memory-cheap. Undo applies the *inverted* patch to the current document; redo
 * re-applies the forward patch. **History compression**: consecutive entries that
 * share a `coalesceKey` (e.g. every tick of one drag) are folded into a single
 * entry via `composePatches`, and the stack is capped at `limit`.
 */

import type { DiagramDocument } from '@/dsl';
import type { DocumentPatch } from '../patch/DocumentPatch';
import { applyPatch, invertPatch, composePatches, isEmptyPatch } from '../patch/DocumentPatch';

export interface HistoryEntry {
  readonly label: string;
  readonly patch: DocumentPatch;
  readonly coalesceKey?: string;
}

export interface HistoryConfig {
  /** Max undo depth; older entries are dropped (compression). */
  readonly limit: number;
  /** Whether consecutive same-key entries are merged. */
  readonly coalesce: boolean;
}

export const DEFAULT_HISTORY_CONFIG: HistoryConfig = { limit: 500, coalesce: true };

export interface UndoResult {
  readonly document: DiagramDocument;
  readonly entry: HistoryEntry;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(private readonly config: HistoryConfig = DEFAULT_HISTORY_CONFIG) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoDepth(): number {
    return this.undoStack.length;
  }
  get redoDepth(): number {
    return this.redoStack.length;
  }
  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }
  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }

  /**
   * Record a forward patch. Clears the redo stack. Coalesces into the top entry
   * when both carry the same `coalesceKey` (drag/pan/zoom compression).
   */
  record(entry: HistoryEntry): void {
    if (isEmptyPatch(entry.patch)) return;
    this.redoStack = [];

    const top = this.undoStack[this.undoStack.length - 1];
    if (this.config.coalesce && entry.coalesceKey && top && top.coalesceKey === entry.coalesceKey) {
      this.undoStack[this.undoStack.length - 1] = {
        label: entry.label,
        coalesceKey: entry.coalesceKey,
        patch: composePatches(top.patch, entry.patch),
      };
      return;
    }

    this.undoStack.push(entry);
    while (this.undoStack.length > this.config.limit) this.undoStack.shift();
  }

  /** Undo the most recent entry against `doc`. Returns null if the stack is empty. */
  undo(doc: DiagramDocument): UndoResult | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    const document = applyPatch(doc, invertPatch(entry.patch));
    this.redoStack.push(entry);
    return { document, entry };
  }

  /** Redo the most recently undone entry against `doc`. */
  redo(doc: DiagramDocument): UndoResult | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    const document = applyPatch(doc, entry.patch);
    this.undoStack.push(entry);
    return { document, entry };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
