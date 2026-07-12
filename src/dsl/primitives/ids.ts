/**
 * Branded identifier types and pluggable ID generation.
 *
 * Every entity in the DSL is addressed by a *branded* string id. Branding is a
 * compile-time-only device: a `NodeId` is a `string` at runtime, but the type
 * system refuses to let you pass an `EdgeId` where a `NodeId` is expected. This
 * catches a whole class of "wrong id" bugs for free and makes the AI-facing API
 * self-documenting, with zero runtime cost.
 *
 * ID *generation* is injected via {@link IdFactory} so the DSL never reaches for
 * a global (`crypto`, a counter) implicitly. Production uses
 * {@link createUuidIdFactory}; tests use {@link createSequentialIdFactory} for
 * fully deterministic ids.
 */

declare const __brand: unique symbol;

/** Attach a compile-time-only nominal tag `B` to a base type `T`. */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type NodeId = Brand<string, 'NodeId'>;
export type EdgeId = Brand<string, 'EdgeId'>;
export type GroupId = Brand<string, 'GroupId'>;
export type LayerId = Brand<string, 'LayerId'>;
export type StyleId = Brand<string, 'StyleId'>;
export type TagId = Brand<string, 'TagId'>;
export type AnnotationId = Brand<string, 'AnnotationId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type DocumentId = Brand<string, 'DocumentId'>;
/** A named connection point on a node (edges may attach to a specific port). */
export type PortId = Brand<string, 'PortId'>;

/** Any entity id — useful for cross-collection uniqueness checks. */
export type EntityId =
  | NodeId
  | EdgeId
  | GroupId
  | LayerId
  | StyleId
  | TagId
  | AnnotationId
  | CommentId
  | DocumentId;

/** The kinds of entity an {@link IdFactory} can mint ids for. */
export type IdKind =
  | 'node'
  | 'edge'
  | 'group'
  | 'layer'
  | 'style'
  | 'tag'
  | 'annotation'
  | 'comment'
  | 'document'
  | 'port';

/**
 * Mints fresh, unique ids. Injected wherever the DSL creates entities so id
 * generation is deterministic in tests and swappable (uuid, counter, ULID, …).
 */
export interface IdFactory {
  node(): NodeId;
  edge(): EdgeId;
  group(): GroupId;
  layer(): LayerId;
  style(): StyleId;
  tag(): TagId;
  annotation(): AnnotationId;
  comment(): CommentId;
  document(): DocumentId;
  port(): PortId;
}

/** Build an {@link IdFactory} from a single `(kind) => rawId` generator. */
function idFactoryFrom(generate: (kind: IdKind) => string): IdFactory {
  return {
    node: () => generate('node') as NodeId,
    edge: () => generate('edge') as EdgeId,
    group: () => generate('group') as GroupId,
    layer: () => generate('layer') as LayerId,
    style: () => generate('style') as StyleId,
    tag: () => generate('tag') as TagId,
    annotation: () => generate('annotation') as AnnotationId,
    comment: () => generate('comment') as CommentId,
    document: () => generate('document') as DocumentId,
    port: () => generate('port') as PortId,
  };
}

/** Best-effort RFC-4122 v4 uuid, falling back when `crypto` is unavailable. */
function randomUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback: not cryptographically strong, but unique enough for ids.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Production id factory. Ids look like `node_1f0c…` — a human-readable kind
 * prefix plus a uuid, which keeps them debuggable and collision-free.
 */
export function createUuidIdFactory(): IdFactory {
  return idFactoryFrom((kind) => `${kind}_${randomUuid()}`);
}

/**
 * Deterministic id factory for tests and reproducible fixtures. Ids are
 * `node_000001`, `node_000002`, … per kind, so serialized output is stable and
 * snapshot-friendly. `seed` offsets the counter.
 */
export function createSequentialIdFactory(seed = 0): IdFactory {
  const counters = new Map<IdKind, number>();
  return idFactoryFrom((kind) => {
    const next = (counters.get(kind) ?? seed) + 1;
    counters.set(kind, next);
    return `${kind}_${String(next).padStart(6, '0')}`;
  });
}
