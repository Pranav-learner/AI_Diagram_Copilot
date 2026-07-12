/**
 * The open metadata system.
 *
 * Every entity (and the document itself) carries a `metadata` bag: an arbitrary,
 * JSON-serializable key/value map. This is the primary extension point for
 * future modules — AI can attach `confidence`, a reviewer can attach `reviewed`,
 * an importer can attach `source` — all *without changing the schema*.
 *
 * The bag is intentionally untyped (open), but well-known keys are given names
 * ({@link MetaKeys}) and typed accessors so common attributes stay consistent
 * across the codebase.
 */

/** A JSON primitive. */
export type MetadataPrimitive = string | number | boolean | null;

/** Any JSON-serializable value. Metadata must round-trip through JSON. */
export type MetadataValue =
  | MetadataPrimitive
  | readonly MetadataValue[]
  | { readonly [key: string]: MetadataValue };

/** An entity's metadata bag. Immutable — updates return a new bag. */
export type Metadata = Readonly<Record<string, MetadataValue>>;

export const EMPTY_METADATA: Metadata = Object.freeze({});

/**
 * Conventional metadata keys. Using these constants (instead of raw strings)
 * keeps attributes consistent across modules and refactors. The bag remains
 * open — these are conventions, not a closed set.
 */
export const MetaKeys = {
  /** Boolean — produced by an AI module rather than a human. */
  aiGenerated: 'aiGenerated',
  /** Boolean — entity is locked against edits. */
  locked: 'locked',
  /** Boolean — entity has been human-reviewed. */
  reviewed: 'reviewed',
  /** Number in [0,1] — AI confidence in this entity. */
  confidence: 'confidence',
  /** String — provenance (e.g. import filename, prompt id). */
  source: 'source',
  /** String — author identifier. */
  createdBy: 'createdBy',
  /** String — business/domain the entity models. */
  domain: 'domain',
  /** String — free-form categorization. */
  category: 'category',
} as const;

export type MetaKey = (typeof MetaKeys)[keyof typeof MetaKeys];

/** Read a metadata value, or `undefined` if absent. */
export function getMeta(meta: Metadata, key: string): MetadataValue | undefined {
  return meta[key];
}

/** Return a new bag with `key` set to `value` (does not mutate `meta`). */
export function setMeta(meta: Metadata, key: string, value: MetadataValue): Metadata {
  return { ...meta, [key]: value };
}

/** Return a new bag with `key` removed. */
export function deleteMeta(meta: Metadata, key: string): Metadata {
  if (!(key in meta)) return meta;
  const next = { ...meta };
  delete next[key];
  return next;
}

/** Typed convenience: is this entity AI-generated? */
export function isAiGenerated(meta: Metadata): boolean {
  return meta[MetaKeys.aiGenerated] === true;
}

/** Typed convenience: is this entity locked? */
export function isLocked(meta: Metadata): boolean {
  return meta[MetaKeys.locked] === true;
}

/** Typed convenience: read AI confidence in [0,1], or `undefined`. */
export function getConfidence(meta: Metadata): number | undefined {
  const value = meta[MetaKeys.confidence];
  return typeof value === 'number' ? value : undefined;
}
