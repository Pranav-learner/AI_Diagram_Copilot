/**
 * ReferenceResolver — turns a semantic {@link ElementReference} into concrete ids.
 *
 * This is where "the database", "the largest node", "these", and "PostgreSQL"
 * become real element ids — **before execution**, and **without guessing**. A
 * reference may resolve to zero, one, or many elements; the calling edit decides
 * whether that is valid (a rename needs exactly one; a recolour accepts many).
 * When a singular edit's reference is ambiguous, the resolver's candidate list
 * feeds a clarification question. All resolution is app-side over the
 * {@link DiagramUnderstanding} — the model's job is to point, ours is to aim.
 */

import type { ElementReference, SuperlativeMetric } from './model/EditPlan';
import type { DiagramUnderstanding, UnderstoodGroup, UnderstoodNode } from './DiagramUnderstanding';

export type RefKind = 'node' | 'group';

export interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
}

export interface ResolvedReference {
  /** Matched element ids (0, 1, or many). */
  readonly ids: readonly string[];
  /** Rich candidates for clarification/preview. */
  readonly candidates: readonly Candidate[];
}

const EMPTY: ResolvedReference = { ids: [], candidates: [] };

export class ReferenceResolver {
  constructor(
    private readonly understanding: DiagramUnderstanding,
    /** Local ref → minted DSL id for elements created earlier in the same plan. */
    private readonly newRefs: ReadonlyMap<string, string> = new Map(),
  ) {}

  resolve(ref: ElementReference, kind: RefKind): ResolvedReference {
    switch (ref.by) {
      case 'id':
        return this.byId(ref.id, kind);
      case 'label':
        return this.byLabel(ref.label, kind);
      case 'selection':
        return this.bySelection(ref.index, kind);
      case 'new':
        return this.byNew(ref.ref);
      case 'descriptor':
        return this.byDescriptor(ref.text, kind);
      case 'superlative':
        return this.bySuperlative(ref.metric, kind);
      default:
        return EMPTY;
    }
  }

  // ── Strategies ──────────────────────────────────────────────────────────────

  private byId(id: string, kind: RefKind): ResolvedReference {
    // A plan-local `new` id may be passed as an `id` too — accept both.
    const minted = this.newRefs.get(id);
    if (minted) return { ids: [minted], candidates: [{ id: minted, label: id }] };
    const found = this.collection(kind).find((e) => e.id === id);
    return found ? single(found) : EMPTY;
  }

  private byLabel(label: string, kind: RefKind): ResolvedReference {
    const norm = normalize(label);
    const items = this.collection(kind);
    const exact = items.filter((e) => normalize(e.label) === norm);
    if (exact.length > 0) return toResolved(exact);
    const contains = items.filter((e) => normalize(e.label).includes(norm));
    return toResolved(contains);
  }

  private bySelection(index: number | undefined, kind: RefKind): ResolvedReference {
    const selected = this.understanding.selection;
    if (kind === 'node') {
      const nodes = this.understanding.nodes.filter((n) => selected.includes(n.id));
      if (index !== undefined) return nodes[index] ? single(nodes[index]!) : EMPTY;
      return toResolved(nodes);
    }
    // Group kind: groups that contain any selected node.
    const groups = this.understanding.groups.filter((g) => g.memberIds.some((m) => selected.includes(m)));
    return toResolved(groups);
  }

  private byNew(ref: string): ResolvedReference {
    const id = this.newRefs.get(ref);
    return id ? { ids: [id], candidates: [{ id, label: ref }] } : EMPTY;
  }

  private byDescriptor(text: string, kind: RefKind): ResolvedReference {
    const tokens = tokenize(text);
    if (tokens.length === 0) return EMPTY;
    const items = this.collection(kind);
    const haystack = (e: UnderstoodNode | UnderstoodGroup) =>
      normalize(`${e.label} ${'role' in e && e.role ? e.role : ''}`);

    // Prefer items matching ALL tokens; fall back to ANY token.
    const all = items.filter((e) => tokens.every((t) => haystack(e).includes(t)));
    if (all.length > 0) return toResolved(all);
    const any = items.filter((e) => tokens.some((t) => haystack(e).includes(t)));
    return toResolved(any);
  }

  private bySuperlative(metric: SuperlativeMetric, kind: RefKind): ResolvedReference {
    const items = this.collection(kind);
    if (items.length === 0) return EMPTY;
    const rect = (e: UnderstoodNode | UnderstoodGroup) =>
      'area' in e ? { x: e.position.x, y: e.position.y, w: e.size.width, h: e.size.height } : { x: e.bounds.x, y: e.bounds.y, w: e.bounds.width, h: e.bounds.height };
    const score = (e: UnderstoodNode | UnderstoodGroup): number => {
      const r = rect(e);
      switch (metric) {
        case 'largest':
          return r.w * r.h;
        case 'smallest':
          return -(r.w * r.h);
        case 'leftmost':
          return -r.x;
        case 'rightmost':
          return r.x + r.w;
        case 'topmost':
          return -r.y;
        case 'bottommost':
          return r.y + r.h;
      }
    };
    const winner = [...items].sort((a, b) => score(b) - score(a))[0]!;
    return single(winner);
  }

  private collection(kind: RefKind): ReadonlyArray<UnderstoodNode | UnderstoodGroup> {
    return kind === 'node' ? this.understanding.nodes : this.understanding.groups;
  }
}

function single(e: UnderstoodNode | UnderstoodGroup): ResolvedReference {
  return { ids: [e.id], candidates: [candidateOf(e)] };
}

function toResolved(items: ReadonlyArray<UnderstoodNode | UnderstoodGroup>): ResolvedReference {
  return { ids: items.map((e) => e.id), candidates: items.map(candidateOf) };
}

function candidateOf(e: UnderstoodNode | UnderstoodGroup): Candidate {
  const hint = 'role' in e && e.role ? e.role : 'memberIds' in e ? `${e.memberIds.length} members` : undefined;
  return hint ? { id: e.id, label: e.label, hint } : { id: e.id, label: e.label };
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set(['the', 'and', 'all', 'node', 'nodes', 'element', 'elements']);
