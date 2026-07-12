/**
 * The Edit Preview — a semantic, human-readable summary of what an EditPlan will
 * do, computed **before** anything is applied.
 *
 * The UX contract: users see exactly what the AI intends to change and approve
 * or reject it before the runtime is touched. The preview is derived from the
 * resolved edits (not by executing them), and carries the affected existing
 * element ids so the canvas can highlight them.
 */

export type PreviewChangeKind =
  | 'add'
  | 'remove'
  | 'rename'
  | 'move'
  | 'resize'
  | 'connect'
  | 'disconnect'
  | 'restyle'
  | 'metadata'
  | 'group'
  | 'ungroup'
  | 'reorder';

export interface PreviewChange {
  readonly kind: PreviewChangeKind;
  /** One-line human summary, e.g. `Add “Redis”` or `Connect API → Redis`. */
  readonly summary: string;
  /** Existing element ids this change touches (for highlighting). */
  readonly targetIds: readonly string[];
}

export interface EditPreview {
  readonly summary?: string;
  readonly changes: readonly PreviewChange[];
  /** Union of existing element ids affected — for canvas highlighting/selection. */
  readonly affectedIds: readonly string[];
  /** Number of runtime operations the plan compiles to. */
  readonly operationCount: number;
}

/** Aggregate change counts for a compact headline, e.g. "+2 nodes · 3 edges". */
export function summarizePreview(preview: EditPreview): string {
  const counts = new Map<PreviewChangeKind, number>();
  for (const c of preview.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  const parts: string[] = [];
  for (const [kind, n] of counts) parts.push(`${n} ${kind}${n > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
