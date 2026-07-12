/**
 * A concrete {@link DiagramRepository} over a pluggable {@link StorageBackend}.
 *
 * Defaults to an in-memory `Map`, making it ideal for tests and the DSL's own
 * demos. The persistence policy lives here (not in the storage seam): `save`
 * refuses to persist an invalid document, and `load` runs the migration chain —
 * so any backend gets integrity + versioning for free.
 */

import { DiagramValidationError } from '../core/errors';
import type { DiagramDocument } from '../model/document';
import { serialize, deserialize } from '../serialization/serialize';
import { validate } from '../validation/validate';
import type { DiagramRepository, StorageBackend } from './DiagramRepository';

/** A trivial in-memory {@link StorageBackend} backed by a `Map`. */
export class MemoryStorageBackend implements StorageBackend {
  private readonly store = new Map<string, string>();

  get(key: string): string | undefined {
    return this.store.get(key);
  }
  set(key: string, value: string): void {
    this.store.set(key, value);
  }
  delete(key: string): void {
    this.store.delete(key);
  }
  keys(): readonly string[] {
    return [...this.store.keys()];
  }
}

export class InMemoryDiagramRepository implements DiagramRepository {
  private readonly storage: StorageBackend;

  constructor(storage: StorageBackend = new MemoryStorageBackend()) {
    this.storage = storage;
  }

  async load(id: string): Promise<DiagramDocument | null> {
    const raw = await this.storage.get(id);
    if (raw === undefined) return null;
    return deserialize(raw);
  }

  async save(doc: DiagramDocument): Promise<void> {
    const result = validate(doc);
    if (!result.valid) throw new DiagramValidationError(result.errors);
    await this.storage.set(doc.id, serialize(doc));
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete(id);
  }

  async list(): Promise<readonly string[]> {
    return this.storage.keys();
  }
}
