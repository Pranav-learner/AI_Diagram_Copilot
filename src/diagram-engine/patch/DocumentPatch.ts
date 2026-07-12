/**
 * DocumentPatch — a compact, reversible delta between two documents.
 *
 * This is the reversible record behind the operation runtime. Operations are
 * forward-only (`apply(doc) → nextDoc`); the runtime derives the patch by diffing
 * before/after, so **no operation ever writes an inverse** and cascades are
 * captured automatically. A patch stores only the entities that changed (added /
 * removed / changed) plus scalar before/after for viewport/metadata/name — cheap
 * in memory, and trivially invertible (swap added↔removed, before↔after).
 *
 * `composePatches` folds two sequential patches into one — used for transaction
 * accumulation and history compression.
 */

import type {
  DiagramDocument,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  Layer,
  NamedStyle,
  DiagramTag,
  Annotation,
  DiagramComment,
  Viewport,
  Metadata,
  Timestamp,
} from '@/dsl';
import { stableStringify } from '@/dsl';

export interface MapPatch<T> {
  readonly added: Readonly<Record<string, T>>;
  readonly removed: Readonly<Record<string, T>>;
  readonly changed: Readonly<Record<string, { readonly before: T; readonly after: T }>>;
}

export interface ScalarPatch<T> {
  readonly before: T;
  readonly after: T;
}

export interface DocumentPatch {
  readonly nodes?: MapPatch<DiagramNode>;
  readonly edges?: MapPatch<DiagramEdge>;
  readonly groups?: MapPatch<DiagramGroup>;
  readonly layers?: MapPatch<Layer>;
  readonly styles?: MapPatch<NamedStyle>;
  readonly tags?: MapPatch<DiagramTag>;
  readonly annotations?: MapPatch<Annotation>;
  readonly comments?: MapPatch<DiagramComment>;
  readonly viewport?: ScalarPatch<Viewport>;
  readonly metadata?: ScalarPatch<Metadata>;
  readonly name?: ScalarPatch<string | undefined>;
  readonly updatedAt?: ScalarPatch<Timestamp>;
}

const MAP_COLLECTIONS = [
  'nodes',
  'edges',
  'groups',
  'layers',
  'styles',
  'tags',
  'annotations',
  'comments',
] as const;

type AnyMap = Readonly<Record<string, unknown>>;

const eq = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

function isEmptyMapPatch<T>(patch: MapPatch<T>): boolean {
  return (
    Object.keys(patch.added).length === 0 &&
    Object.keys(patch.removed).length === 0 &&
    Object.keys(patch.changed).length === 0
  );
}

function diffMap<T>(before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>): MapPatch<T> | undefined {
  const added: Record<string, T> = {};
  const removed: Record<string, T> = {};
  const changed: Record<string, { before: T; after: T }> = {};
  for (const id of Object.keys(after)) {
    if (!(id in before)) added[id] = after[id]!;
    else if (!eq(before[id], after[id])) changed[id] = { before: before[id]!, after: after[id]! };
  }
  for (const id of Object.keys(before)) {
    if (!(id in after)) removed[id] = before[id]!;
  }
  const patch: MapPatch<T> = { added, removed, changed };
  return isEmptyMapPatch(patch) ? undefined : patch;
}

function scalarPatch<T>(before: T, after: T): ScalarPatch<T> | undefined {
  return eq(before, after) ? undefined : { before, after };
}

/** Compute the reversible patch that transforms `before` into `after`. */
export function diffToPatch(before: DiagramDocument, after: DiagramDocument): DocumentPatch {
  const patch: Record<string, unknown> = {};
  for (const key of MAP_COLLECTIONS) {
    const p = diffMap(before[key] as AnyMap, after[key] as AnyMap);
    if (p) patch[key] = p;
  }
  const viewport = scalarPatch(before.viewport, after.viewport);
  if (viewport) patch.viewport = viewport;
  const metadata = scalarPatch(before.metadata, after.metadata);
  if (metadata) patch.metadata = metadata;
  const name = scalarPatch(before.name, after.name);
  if (name) patch.name = name;
  const updatedAt = scalarPatch(before.updatedAt, after.updatedAt);
  if (updatedAt) patch.updatedAt = updatedAt;
  return patch as DocumentPatch;
}

/** True if the patch changes nothing. */
export function isEmptyPatch(patch: DocumentPatch): boolean {
  return Object.keys(patch).length === 0;
}

function applyMap<T>(map: Readonly<Record<string, T>>, patch: MapPatch<T> | undefined): Readonly<Record<string, T>> {
  if (!patch) return map;
  const out: Record<string, T> = { ...map };
  for (const id of Object.keys(patch.removed)) delete out[id];
  for (const id of Object.keys(patch.added)) out[id] = patch.added[id]!;
  for (const id of Object.keys(patch.changed)) out[id] = patch.changed[id]!.after;
  return out;
}

/** Apply a patch forward, returning a new document. */
export function applyPatch(doc: DiagramDocument, patch: DocumentPatch): DiagramDocument {
  const next: Record<string, unknown> = { ...doc };
  for (const key of MAP_COLLECTIONS) {
    next[key] = applyMap(doc[key] as AnyMap, patch[key] as MapPatch<unknown> | undefined);
  }
  if (patch.viewport) next.viewport = patch.viewport.after;
  if (patch.metadata) next.metadata = patch.metadata.after;
  if (patch.name) next.name = patch.name.after;
  if (patch.updatedAt) next.updatedAt = patch.updatedAt.after;
  return next as unknown as DiagramDocument;
}

function invertMap<T>(patch: MapPatch<T>): MapPatch<T> {
  const changed: Record<string, { before: T; after: T }> = {};
  for (const [id, c] of Object.entries(patch.changed)) changed[id] = { before: c.after, after: c.before };
  return { added: patch.removed, removed: patch.added, changed };
}

/** Invert a patch, so applying it undoes the original. */
export function invertPatch(patch: DocumentPatch): DocumentPatch {
  const out: Record<string, unknown> = {};
  for (const key of MAP_COLLECTIONS) {
    const p = patch[key] as MapPatch<unknown> | undefined;
    if (p) out[key] = invertMap(p);
  }
  if (patch.viewport) out.viewport = { before: patch.viewport.after, after: patch.viewport.before };
  if (patch.metadata) out.metadata = { before: patch.metadata.after, after: patch.metadata.before };
  if (patch.name) out.name = { before: patch.name.after, after: patch.name.before };
  if (patch.updatedAt) out.updatedAt = { before: patch.updatedAt.after, after: patch.updatedAt.before };
  return out as DocumentPatch;
}

// ── Composition (transaction accumulation + history compression) ──────────────

const ABSENT = Symbol('absent');
type MaybeAbsent<T> = T | typeof ABSENT;

function beforeOf<T>(a: MapPatch<T> | undefined, b: MapPatch<T> | undefined, id: string): MaybeAbsent<T> {
  if (a) {
    if (id in a.removed) return a.removed[id]!;
    if (id in a.changed) return a.changed[id]!.before;
    if (id in a.added) return ABSENT;
  }
  if (b) {
    if (id in b.removed) return b.removed[id]!;
    if (id in b.changed) return b.changed[id]!.before;
    if (id in b.added) return ABSENT;
  }
  return ABSENT;
}

function afterOf<T>(a: MapPatch<T> | undefined, b: MapPatch<T> | undefined, id: string): MaybeAbsent<T> {
  if (b) {
    if (id in b.added) return b.added[id]!;
    if (id in b.changed) return b.changed[id]!.after;
    if (id in b.removed) return ABSENT;
  }
  if (a) {
    if (id in a.added) return a.added[id]!;
    if (id in a.changed) return a.changed[id]!.after;
    if (id in a.removed) return ABSENT;
  }
  return ABSENT;
}

function composeMapPatch<T>(a: MapPatch<T> | undefined, b: MapPatch<T> | undefined): MapPatch<T> | undefined {
  if (!a) return b;
  if (!b) return a;
  const ids = new Set<string>();
  for (const p of [a, b]) {
    for (const id of Object.keys(p.added)) ids.add(id);
    for (const id of Object.keys(p.removed)) ids.add(id);
    for (const id of Object.keys(p.changed)) ids.add(id);
  }
  const added: Record<string, T> = {};
  const removed: Record<string, T> = {};
  const changed: Record<string, { before: T; after: T }> = {};
  for (const id of ids) {
    const before = beforeOf(a, b, id);
    const after = afterOf(a, b, id);
    const wasAbsent = before === ABSENT;
    const nowAbsent = after === ABSENT;
    if (wasAbsent && nowAbsent) continue; // net no-op (created then deleted)
    if (wasAbsent) added[id] = after as T;
    else if (nowAbsent) removed[id] = before as T;
    else if (!eq(before, after)) changed[id] = { before: before as T, after: after as T };
  }
  const patch: MapPatch<T> = { added, removed, changed };
  return isEmptyMapPatch(patch) ? undefined : patch;
}

function composeScalar<T>(a: ScalarPatch<T> | undefined, b: ScalarPatch<T> | undefined): ScalarPatch<T> | undefined {
  if (!a) return b;
  if (!b) return a;
  return eq(a.before, b.after) ? undefined : { before: a.before, after: b.after };
}

/** Fold two sequential patches (a then b) into a single equivalent patch. */
export function composePatches(a: DocumentPatch, b: DocumentPatch): DocumentPatch {
  const out: Record<string, unknown> = {};
  for (const key of MAP_COLLECTIONS) {
    const p = composeMapPatch(a[key] as MapPatch<unknown> | undefined, b[key] as MapPatch<unknown> | undefined);
    if (p) out[key] = p;
  }
  const viewport = composeScalar(a.viewport, b.viewport);
  if (viewport) out.viewport = viewport;
  const metadata = composeScalar(a.metadata, b.metadata);
  if (metadata) out.metadata = metadata;
  const name = composeScalar(a.name, b.name);
  if (name) out.name = name;
  const updatedAt = composeScalar(a.updatedAt, b.updatedAt);
  if (updatedAt) out.updatedAt = updatedAt;
  return out as DocumentPatch;
}

/** A short human summary of what a patch touches (for history labels / debugging). */
export function summarizePatch(patch: DocumentPatch): string {
  const parts: string[] = [];
  for (const key of MAP_COLLECTIONS) {
    const p = patch[key] as MapPatch<unknown> | undefined;
    if (!p) continue;
    const a = Object.keys(p.added).length;
    const r = Object.keys(p.removed).length;
    const c = Object.keys(p.changed).length;
    if (a) parts.push(`+${a} ${key}`);
    if (r) parts.push(`-${r} ${key}`);
    if (c) parts.push(`~${c} ${key}`);
  }
  if (patch.viewport) parts.push('viewport');
  if (patch.metadata) parts.push('metadata');
  return parts.join(', ') || 'no-op';
}
