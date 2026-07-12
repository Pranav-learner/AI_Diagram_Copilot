/**
 * Serialization and structural parsing.
 *
 * `serialize` produces a **stable** JSON string — object keys are sorted and
 * `undefined` fields dropped — so equal documents always stringify identically.
 * That determinism is what makes {@link equals} and byte-level diffing reliable.
 *
 * `deserialize` is the trusted entry for untrusted input: parse -> migrate to
 * the current schema version -> assert the structural shape. Semantic
 * validation (referential integrity) is a separate, explicit `validate` step.
 */

import { DiagramShapeError } from '../core/errors';
import type { DiagramDocument } from '../model/document';
import { ENTITY_COLLECTIONS } from '../model/document';
import { migrate } from '../migration/migrate';

/** Recursively sort object keys and drop `undefined` for stable output. */
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v !== undefined) out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

/** Canonical, deterministic JSON string for any JSON-serializable value. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/** Serialize a document to a stable JSON string. */
export function serialize(doc: DiagramDocument): string {
  return stableStringify(doc);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural (not semantic) shape check for a parsed document. */
export function isDiagramDocumentShape(raw: unknown): raw is DiagramDocument {
  if (!isPlainObject(raw)) return false;
  if (typeof raw['schemaVersion'] !== 'string') return false;
  if (typeof raw['id'] !== 'string') return false;
  if (typeof raw['createdAt'] !== 'string' || typeof raw['updatedAt'] !== 'string') {
    return false;
  }
  if (!isPlainObject(raw['metadata'])) return false;
  if (!isPlainObject(raw['viewport'])) return false;
  for (const collection of ENTITY_COLLECTIONS) {
    if (!isPlainObject(raw[collection])) return false;
  }
  return true;
}

/** Throw {@link DiagramShapeError} unless `raw` is a structurally valid document. */
export function assertDocumentShape(raw: unknown): asserts raw is DiagramDocument {
  if (!isDiagramDocumentShape(raw)) {
    throw new DiagramShapeError('Value is not a structurally valid DiagramDocument');
  }
}

/**
 * Parse (if a string), migrate to the current schema, and structurally validate.
 * Does *not* run referential validation — call `validate` for that.
 */
export function deserialize(input: string | unknown): DiagramDocument {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (cause) {
      throw new DiagramShapeError(
        `Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
  const migrated = migrate(parsed);
  assertDocumentShape(migrated);
  return migrated;
}
