/**
 * The repository abstraction — persistence without coupling.
 *
 * `DiagramRepository` is a storage-agnostic port: load / save / delete / list,
 * all keyed by document id. It knows nothing about Excalidraw, HTTP, or SQL. A
 * concrete repository is composed from a {@link StorageBackend} (a bare
 * key/value seam), so the same repository logic — validate on save, migrate on
 * load — works over an in-memory map, `localStorage`, or a REST/DB adapter
 * supplied by a later module.
 *
 * The interface is async so real backends (network, disk) fit without changing
 * callers; the in-memory implementation simply resolves immediately.
 */

import type { DiagramDocument } from '../model/document';

/** A minimal, async key/value store the repository persists strings into. */
export interface StorageBackend {
  get(key: string): Promise<string | undefined> | string | undefined;
  set(key: string, value: string): Promise<void> | void;
  delete(key: string): Promise<void> | void;
  keys(): Promise<readonly string[]> | readonly string[];
}

export interface DiagramRepository {
  /** Load and migrate a document, or `null` if none is stored under `id`. */
  load(id: string): Promise<DiagramDocument | null>;
  /** Validate, then persist a document under its own id. */
  save(doc: DiagramDocument): Promise<void>;
  /** Remove a stored document. No-op if absent. */
  delete(id: string): Promise<void>;
  /** List the ids of all stored documents. */
  list(): Promise<readonly string[]>;
}
