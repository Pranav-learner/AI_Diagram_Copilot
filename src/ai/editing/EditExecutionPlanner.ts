/**
 * EditExecutionPlanner — converts a validated EditPlan into runtime operations.
 *
 * The editing counterpart of generation's ExecutionPlanner, and the sole owner
 * of edit → operation translation (the LLM never produces operations). It:
 *   • resolves every {@link ElementReference} to concrete ids (via
 *     {@link ReferenceResolver}) — collecting a {@link Clarification} when a
 *     singular reference is ambiguous and an {@link EditIssue} when it's unknown;
 *   • computes geometry the model never sends (placement, nudges, z-order);
 *   • emits `{ type, params }` operation descriptors for the runtime registry; and
 *   • builds a semantic {@link EditPreview} in lock-step, so the UI can show the
 *     change before anything is applied.
 *
 * If any clarification or error is produced, the caller does NOT apply — the
 * diagram is never touched on an ambiguous or invalid edit.
 */

import type { NewNode, Point, Size, Metadata, MetadataValue } from '@/dsl';
import type { OperationDescriptor, OperationPlan } from '../validation/schemas/operationPlan';
import type { IdMinter } from '../planning/OperationPlanner';
import { counterIdMinter } from '../planning/OperationPlanner';
import { shapeForRole, sizeForNode, arrowheadsForDirection } from '../generation/styling';
import type { EditOp, EditPlan, ElementReference, MoveTarget } from './model/EditPlan';
import type { DiagramUnderstanding, UnderstoodNode } from './DiagramUnderstanding';
import { ReferenceResolver } from './ReferenceResolver';
import type { RefKind } from './ReferenceResolver';
import type { Clarification, EditIssue } from './clarification';
import { editError, editWarning } from './clarification';
import { styleHintsToStyle, hasStyleChange } from './editStyling';
import type { EditPreview, PreviewChange, PreviewChangeKind } from './preview';

const DEFAULT_GAP = 60;
const NUDGE = 160;

export interface EditCompileResult {
  readonly operations: OperationPlan;
  readonly preview: EditPreview;
  /** Ambiguous references needing user input — non-empty means "do not apply". */
  readonly clarifications: readonly Clarification[];
  /** Hard problems (unknown refs, invalid edits) — non-empty means "reject". */
  readonly issues: readonly EditIssue[];
}

export interface EditExecutionPlannerDeps {
  readonly ids?: IdMinter;
}

export class EditExecutionPlanner {
  private readonly ids: IdMinter;

  constructor(deps: EditExecutionPlannerDeps = {}) {
    this.ids = deps.ids ?? counterIdMinter('edit');
  }

  compile(plan: EditPlan, understanding: DiagramUnderstanding): EditCompileResult {
    const ctx = new CompileContext(understanding, this.ids);
    plan.edits.forEach((edit, index) => this.compileEdit(edit, index, ctx));
    return {
      operations: { operations: ctx.operations, atomic: true, label: plan.summary ?? 'AI edit' },
      preview: {
        summary: plan.summary,
        changes: ctx.changes,
        affectedIds: [...ctx.affected],
        operationCount: ctx.operations.length,
      },
      clarifications: ctx.clarifications,
      issues: ctx.issues,
    };
  }

  private compileEdit(edit: EditOp, i: number, ctx: CompileContext): void {
    switch (edit.op) {
      case 'add_node': {
        const id = ctx.mintNode(edit.ref, edit.label);
        const shape = shapeForRole(edit.nodeType);
        const size = sizeForNode({ id: edit.ref, label: edit.label }, shape);
        const position = this.placementFor(edit.near, edit.direction, size, ctx);
        const spec: NewNode = {
          type: 'shape',
          shape,
          semantic: edit.nodeType,
          label: { text: edit.label },
          position,
          size,
          metadata: { aiGenerated: true },
        };
        ctx.op('node.create', { id, spec }, `Add ${edit.label}`);
        if (edit.group) ctx.addToExistingGroup(edit.group, id, i);
        ctx.change('add', `“${edit.label}”`, []);
        break;
      }
      case 'remove_node': {
        const id = ctx.resolveOne(edit.target, 'node', i, 'remove');
        if (!id) break;
        ctx.op('node.delete', { id }, 'Delete node');
        ctx.change('remove', ctx.labelOf(id), [id]);
        break;
      }
      case 'rename_node': {
        const id = ctx.resolveOne(edit.target, 'node', i, 'rename');
        if (!id) break;
        ctx.op('node.rename', { id, text: edit.label }, 'Rename node');
        ctx.change('rename', `${ctx.labelOf(id)} → “${edit.label}”`, [id]);
        break;
      }
      case 'move_node': {
        const id = ctx.resolveOne(edit.target, 'node', i, 'move');
        if (!id) break;
        const node = ctx.node(id);
        const position = this.movePosition(node, edit.to, ctx, i);
        if (!position) break;
        ctx.op('node.move', { id, position }, 'Move node');
        ctx.change('move', ctx.labelOf(id), [id]);
        break;
      }
      case 'resize_node': {
        const id = ctx.resolveOne(edit.target, 'node', i, 'resize');
        if (!id) break;
        const node = ctx.node(id);
        const size = resizeOf(node.size, edit.size, edit.scale);
        ctx.op('node.resize', { id, size }, 'Resize node');
        ctx.change('resize', ctx.labelOf(id), [id]);
        break;
      }
      case 'connect': {
        const source = ctx.resolveOne(edit.source, 'node', i, 'connect source');
        const target = ctx.resolveOne(edit.target, 'node', i, 'connect target');
        if (!source || !target) break;
        const spec: Record<string, unknown> = { arrowheads: arrowheadsForDirection(edit.direction), routing: 'orthogonal' };
        if (edit.label) spec.label = { text: edit.label };
        ctx.op('edge.connect', { id: ctx.mintEdge(), source, target, spec }, 'Connect');
        ctx.change('connect', `${ctx.labelOf(source)} → ${ctx.labelOf(target)}`, [source, target]);
        break;
      }
      case 'disconnect': {
        const source = ctx.resolveOne(edit.source, 'node', i, 'disconnect source');
        const target = ctx.resolveOne(edit.target, 'node', i, 'disconnect target');
        if (!source || !target) break;
        const edges = ctx.edgesBetween(source, target);
        if (edges.length === 0) {
          ctx.issue(editError('unknown_reference', `No connection between ${ctx.labelOf(source)} and ${ctx.labelOf(target)}`, i));
          break;
        }
        for (const edgeId of edges) ctx.op('edge.disconnect', { id: edgeId }, 'Disconnect');
        ctx.change('disconnect', `${ctx.labelOf(source)} ✕ ${ctx.labelOf(target)}`, [source, target]);
        break;
      }
      case 'update_style': {
        if (!hasStyleChange(edit.style)) {
          ctx.issue(editWarning('empty_style', 'Style edit had no recognizable changes', i));
          break;
        }
        const ids = ctx.resolveMany(edit.targets, 'node', i);
        if (ids.length === 0) break;
        const style = styleHintsToStyle(edit.style);
        for (const id of ids) ctx.op('node.style', { id, style }, 'Update style');
        ctx.change('restyle', `${ids.length} node${ids.length > 1 ? 's' : ''}`, ids);
        break;
      }
      case 'update_metadata': {
        const id = ctx.resolveOne(edit.target, 'node', i, 'update');
        if (!id) break;
        const metadata: Metadata = { [edit.key]: edit.value as MetadataValue };
        ctx.op('node.metadata', { id, metadata }, 'Update metadata');
        ctx.change('metadata', `${edit.key} on ${ctx.labelOf(id)}`, [id]);
        break;
      }
      case 'group': {
        const ids = ctx.resolveMany(edit.targets, 'node', i);
        if (ids.length === 0) break;
        const gid = ctx.mintGroup();
        ctx.op('group.create', { id: gid, spec: { name: edit.label, childIds: ids } }, `Group ${edit.label}`);
        ctx.change('group', `${ids.length} nodes as “${edit.label}”`, ids);
        break;
      }
      case 'ungroup': {
        const gid = ctx.resolveOne(edit.target, 'group', i, 'ungroup');
        if (!gid) break;
        ctx.op('group.ungroup', { id: gid }, 'Ungroup');
        ctx.change('ungroup', ctx.groupLabelOf(gid), [gid]);
        break;
      }
      case 'reorder': {
        const id = ctx.resolveOne(edit.target, 'node', i, 'reorder');
        if (!id) break;
        const z = ctx.reorderZ(id, edit.position);
        ctx.op('node.update', { id, patch: { z } }, 'Reorder');
        ctx.change('reorder', `${ctx.labelOf(id)} → ${edit.position}`, [id]);
        break;
      }
    }
  }

  /** Position for a new node: adjacent to `near`, else stacked below the diagram. */
  private placementFor(
    near: ElementReference | undefined,
    direction: 'above' | 'below' | 'left' | 'right' | undefined,
    size: Size,
    ctx: CompileContext,
  ): Point {
    if (near) {
      const anchorId = ctx.resolveSilently(near, 'node');
      if (anchorId) return adjacentPosition(ctx.node(anchorId), size, direction ?? 'right');
    }
    return ctx.nextStackPosition(size);
  }

  /** New position for a moved node from a {@link MoveTarget}. */
  private movePosition(node: UnderstoodNode, to: MoveTarget, ctx: CompileContext, i: number): Point | undefined {
    if (to.relativeTo) {
      const anchorId = ctx.resolveOne(to.relativeTo, 'node', i, 'move anchor');
      if (!anchorId) return undefined;
      return adjacentPosition(ctx.node(anchorId), node.size, to.direction ?? 'below');
    }
    if (to.delta) return { x: node.position.x + to.delta.dx, y: node.position.y + to.delta.dy };
    if (to.position) return to.position;
    if (to.direction) {
      const d = directionDelta(to.direction, NUDGE);
      return { x: node.position.x + d.dx, y: node.position.y + d.dy };
    }
    return node.position;
  }
}

// ── Compile context ──────────────────────────────────────────────────────────

class CompileContext {
  readonly operations: OperationDescriptor[] = [];
  readonly changes: PreviewChange[] = [];
  readonly clarifications: Clarification[] = [];
  readonly issues: EditIssue[] = [];
  readonly affected = new Set<string>();

  private readonly resolver: ReferenceResolver;
  private readonly newRefs = new Map<string, string>();
  /** Labels of nodes created in this plan, so previews can name them. */
  private readonly newLabels = new Map<string, string>();
  private readonly nodeById: Map<string, UnderstoodNode>;
  private stackIndex = 0;

  constructor(private readonly u: DiagramUnderstanding, private readonly ids: IdMinter) {
    this.resolver = new ReferenceResolver(u, this.newRefs);
    this.nodeById = new Map(u.nodes.map((n) => [n.id, n]));
  }

  op(type: string, params: Record<string, unknown>, label?: string): void {
    this.operations.push(label ? { type, params, label } : { type, params });
  }

  change(kind: PreviewChangeKind, summary: string, targetIds: readonly string[]): void {
    this.changes.push({ kind, summary, targetIds });
    for (const id of targetIds) this.affected.add(id);
  }

  issue(issue: EditIssue): void {
    this.issues.push(issue);
  }

  mintNode(ref: string, label?: string): string {
    const id = this.ids.node();
    this.newRefs.set(ref, id);
    if (label) this.newLabels.set(id, label);
    return id;
  }
  mintEdge(): string {
    return this.ids.edge();
  }
  mintGroup(): string {
    return this.ids.group();
  }

  /** Resolve a reference expected to identify exactly one element. */
  resolveOne(ref: ElementReference, kind: RefKind, editIndex: number, what: string): string | undefined {
    const r = this.resolver.resolve(ref, kind);
    if (r.ids.length === 1) return r.ids[0];
    if (r.ids.length === 0) {
      this.issue(editError('unknown_reference', `Couldn't find the ${kind} to ${what}`, editIndex));
      return undefined;
    }
    this.clarifications.push({
      code: 'ambiguous_reference',
      message: `Which ${kind} did you mean to ${what}?`,
      reference: ref,
      candidates: r.candidates,
      editIndex,
    });
    return undefined;
  }

  /** Resolve a reference that may identify many elements (recolour, group). */
  resolveMany(refs: readonly ElementReference[], kind: RefKind, editIndex: number): string[] {
    const ids = new Set<string>();
    for (const ref of refs) {
      const r = this.resolver.resolve(ref, kind);
      if (r.ids.length === 0) this.issue(editWarning('unresolved_target', `Skipped a target that matched no ${kind}`, editIndex));
      for (const id of r.ids) ids.add(id);
    }
    return [...ids];
  }

  /** Resolve without producing a clarification/issue (best-effort placement anchor). */
  resolveSilently(ref: ElementReference, kind: RefKind): string | undefined {
    const r = this.resolver.resolve(ref, kind);
    return r.ids.length >= 1 ? r.ids[0] : undefined;
  }

  addToExistingGroup(groupRef: string, nodeId: string, editIndex: number): void {
    const r = this.resolver.resolve({ by: 'label', label: groupRef }, 'group');
    const gid = r.ids[0] ?? this.resolver.resolve({ by: 'id', id: groupRef }, 'group').ids[0];
    if (gid) this.op('group.add', { groupId: gid, childId: nodeId }, 'Add to group');
    else this.issue(editWarning('unknown_group', `Couldn't find group "${groupRef}" to add the node to`, editIndex));
  }

  node(id: string): UnderstoodNode {
    return this.nodeById.get(id) ?? { id, label: id, position: { x: 0, y: 0 }, size: { width: 160, height: 60 }, area: 9600, z: 0, selected: false };
  }

  labelOf(id: string): string {
    return this.nodeById.get(id)?.label ?? this.newLabels.get(id) ?? id;
  }

  groupLabelOf(id: string): string {
    return this.u.groups.find((g) => g.id === id)?.label ?? id;
  }

  edgesBetween(a: string, b: string): string[] {
    return this.u.edges.filter((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)).map((e) => e.id);
  }

  reorderZ(id: string, position: 'front' | 'back' | 'forward' | 'backward'): number {
    const zs = this.u.nodes.map((n) => n.z);
    const maxZ = zs.length ? Math.max(...zs) : 0;
    const minZ = zs.length ? Math.min(...zs) : 0;
    const current = this.node(id).z;
    switch (position) {
      case 'front':
        return maxZ + 1;
      case 'back':
        return minZ - 1;
      case 'forward':
        return current + 1;
      case 'backward':
        return current - 1;
    }
  }

  /** A stacking position below the current diagram for new, unanchored nodes. */
  nextStackPosition(size: Size): Point {
    const base = this.u.bounds;
    const x = (base.width ? base.x : 60) + this.stackIndex * (size.width + 40);
    const y = (base.height ? base.y + base.height + 80 : 60);
    this.stackIndex += 1;
    return { x, y };
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function adjacentPosition(anchor: UnderstoodNode, size: Size, direction: 'above' | 'below' | 'left' | 'right'): Point {
  const a = { x: anchor.position.x, y: anchor.position.y, w: anchor.size.width, h: anchor.size.height };
  switch (direction) {
    case 'right':
      return { x: a.x + a.w + DEFAULT_GAP, y: a.y };
    case 'left':
      return { x: a.x - size.width - DEFAULT_GAP, y: a.y };
    case 'below':
      return { x: a.x, y: a.y + a.h + DEFAULT_GAP };
    case 'above':
      return { x: a.x, y: a.y - size.height - DEFAULT_GAP };
  }
}

function directionDelta(direction: 'above' | 'below' | 'left' | 'right', step: number): { dx: number; dy: number } {
  switch (direction) {
    case 'left':
      return { dx: -step, dy: 0 };
    case 'right':
      return { dx: step, dy: 0 };
    case 'above':
      return { dx: 0, dy: -step };
    case 'below':
      return { dx: 0, dy: step };
  }
}

function resizeOf(current: Size, size: { width?: number; height?: number } | undefined, scale: number | undefined): Size {
  if (scale) return { width: Math.round(current.width * scale), height: Math.round(current.height * scale) };
  return { width: size?.width ?? current.width, height: size?.height ?? current.height };
}
