/**
 * ExecutionPlanner — converts a semantic DiagramPlan into runtime operations.
 *
 * This is where the application, not the LLM, owns everything concrete:
 *   • **layout** — runs the {@link LayoutEngine} to compute positions from the
 *     plan's relationships/hierarchy (the model never sends coordinates);
 *   • **shapes/sizes/styles** — mapped from semantic roles via `styling`;
 *   • **operations** — emits `{ type, params }` {@link OperationDescriptor}s for
 *     the runtime registry (node.create / edge.connect / group.create /
 *     document.metadata), the ONLY way the diagram is mutated.
 *
 * The output is an {@link OperationPlan} (atomic by default → one undoable
 * transaction). The LLM cannot produce operations; it can only describe intent.
 */

import type { NewNode, NewGroup, Point, Size, Style, Metadata, MetadataValue, ShapeKind, RoutingKind } from '@/dsl';
import type { OperationDescriptor, OperationPlan } from '../validation/schemas/operationPlan';
import type { IdMinter } from '../planning/OperationPlanner';
import { counterIdMinter } from '../planning/OperationPlanner';
import type { DiagramPlan, PlanNode } from './model/DiagramPlan';
import type { DiagramTypeRegistry, ResolvedLayout } from './model/DiagramType';
import { defaultDiagramTypeRegistry, resolveLayout } from './model/DiagramType';
import { LayoutEngine } from './layout/LayoutEngine';
import { createDefaultLayoutEngine } from './layout';
import type { LayoutEdge, LayoutInput, LayoutKind, LayoutResult } from './layout/types';
import { buildAdjacency, findRoots } from './layout/graph';
import { arrowheadsForDirection, colorIndexForKey, shapeForRole, sizeForNode, styleForNode } from './styling';

/** Origin offset so the diagram is not flush against the canvas edge. */
const ORIGIN: Point = { x: 60, y: 60 };
const ANNOTATION_SIZE: Size = { width: 180, height: 44 };

export interface ExecutionPlannerDeps {
  readonly layoutEngine?: LayoutEngine;
  readonly typeRegistry?: DiagramTypeRegistry;
  /** Id minter for DSL ids. Default is a deterministic counter (inject a uuid one in prod). */
  readonly ids?: IdMinter;
}

/** Per-node visual decisions computed by the app. */
interface NodeVisual {
  readonly shape: ShapeKind;
  readonly size: Size;
  readonly role?: string;
  readonly style: Style;
}

/** Everything {@link ExecutionPlanner.compile} needs after layout. */
export interface LayoutContext {
  readonly layout: LayoutResult;
  readonly resolved: ResolvedLayout;
  readonly visuals: ReadonlyMap<string, NodeVisual>;
}

export interface ExecutionResult {
  readonly operations: OperationPlan;
  readonly layout: LayoutResult;
  /** plan node id → minted DSL node id (for debugging/tests). */
  readonly nodeIdMap: Readonly<Record<string, string>>;
}

export class ExecutionPlanner {
  private readonly layoutEngine: LayoutEngine;
  private readonly typeRegistry: DiagramTypeRegistry;
  private readonly ids: IdMinter;

  constructor(deps: ExecutionPlannerDeps = {}) {
    this.layoutEngine = deps.layoutEngine ?? createDefaultLayoutEngine();
    this.typeRegistry = deps.typeRegistry ?? defaultDiagramTypeRegistry;
    this.ids = deps.ids ?? counterIdMinter('dsl');
  }

  /** Full conversion: layout, then compile operations. */
  plan(plan: DiagramPlan): ExecutionResult {
    const ctx = this.computeLayout(plan);
    return this.compile(plan, ctx);
  }

  /** Stage 1: compute node visuals + run the layout engine. */
  computeLayout(plan: DiagramPlan): LayoutContext {
    const def = this.typeRegistry.get(plan.diagramType) ?? defaultDiagramTypeRegistry.get('flowchart')!;
    const resolved = resolveLayout(plan.layout, def);

    // Visual decisions per node (app-owned, never from the model).
    const visuals = new Map<string, NodeVisual>();
    plan.nodes.forEach((node) => {
      const shape = shapeForRole(node.type);
      const emphasized = plan.styling?.emphasize?.includes(node.id) ?? false;
      const colorKey = node.group ?? node.type ?? node.id;
      visuals.set(node.id, {
        shape,
        size: sizeForNode(node, shape),
        role: node.type,
        style: styleForNode({ colorIndex: colorIndexForKey(colorKey), emphasized }),
      });
    });

    const input = this.buildLayoutInput(plan, resolved, visuals);
    const layout = this.layoutEngine.compute(resolved.kind, input);
    return { layout, resolved, visuals };
  }

  /** Stage 2: compile the plan + layout into runtime operations. */
  compile(plan: DiagramPlan, ctx: LayoutContext): ExecutionResult {
    // Map plan-local ids → freshly minted DSL ids.
    const nodeIdMap: Record<string, string> = {};
    for (const node of plan.nodes) nodeIdMap[node.id] = this.ids.node();

    const operations: OperationDescriptor[] = [];
    const positionOf = (planId: string): Point => {
      const p = ctx.layout.positions[planId];
      return p ? { x: p.x + ORIGIN.x, y: p.y + ORIGIN.y } : ORIGIN;
    };

    // 1. Nodes.
    for (const node of plan.nodes) {
      const visual = ctx.visuals.get(node.id)!;
      const spec: NewNode = {
        type: 'shape',
        shape: visual.shape,
        semantic: node.type,
        label: { text: node.label },
        position: positionOf(node.id),
        size: visual.size,
        style: visual.style,
        metadata: nodeMetadata(node),
      };
      operations.push(descriptor('node.create', { id: nodeIdMap[node.id], spec }, `Add ${node.label}`));
    }

    // 2. Groups (nodes already exist in the working document).
    for (const group of plan.groups ?? []) {
      const childIds = group.nodeIds.map((id) => nodeIdMap[id]).filter((id): id is string => Boolean(id));
      if (childIds.length === 0) continue;
      const spec: NewGroup = { name: group.label, childIds };
      operations.push(descriptor('group.create', { id: this.ids.group(), spec }, `Group ${group.label}`));
    }

    // 3. Relationships → edges.
    const routing = routingForKind(ctx.resolved.kind);
    for (const rel of plan.relationships) {
      const source = nodeIdMap[rel.source];
      const target = nodeIdMap[rel.target];
      if (!source || !target) continue; // validated earlier; guard defensively
      const spec: Record<string, unknown> = {
        routing,
        arrowheads: arrowheadsForDirection(rel.direction),
      };
      if (rel.label) spec.label = { text: rel.label };
      if (rel.type) spec.metadata = { relType: rel.type };
      operations.push(descriptor('edge.connect', { id: this.ids.edge(), source, target, spec }, 'Connect'));
    }

    // 4. Annotations → text nodes placed near their target.
    for (const annotation of plan.annotations ?? []) {
      const base = annotation.target ? positionOf(annotation.target) : ORIGIN;
      const targetVisual = annotation.target ? ctx.visuals.get(annotation.target) : undefined;
      const spec: NewNode = {
        type: 'text',
        text: annotation.text,
        position: { x: base.x, y: base.y + (targetVisual?.size.height ?? 0) + 12 },
        size: ANNOTATION_SIZE,
      };
      operations.push(descriptor('node.create', { id: this.ids.node(), spec }, 'Add annotation'));
    }

    // 5. Document metadata.
    for (const [key, value] of Object.entries(documentMetadata(plan))) {
      operations.push(descriptor('document.metadata', { key, value }, 'Set metadata'));
    }

    return {
      operations: { operations, atomic: true, label: `Generate: ${plan.title}` },
      layout: ctx.layout,
      nodeIdMap,
    };
  }

  /** Build the abstract layout graph from the plan (relationships + parent edges). */
  private buildLayoutInput(plan: DiagramPlan, resolved: ResolvedLayout, visuals: Map<string, NodeVisual>): LayoutInput {
    const nodes = plan.nodes.map((n) => {
      const size = visuals.get(n.id)!.size;
      return { id: n.id, width: size.width, height: size.height };
    });

    // Edges from relationships, plus synthetic parent→child edges so hierarchy
    // informs the layout even when it is expressed only via `parent`.
    const edges: LayoutEdge[] = [];
    for (const rel of plan.relationships) edges.push({ source: rel.source, target: rel.target });
    for (const node of plan.nodes) if (node.parent) edges.push({ source: node.parent, target: node.id });

    const adjacency = buildAdjacency(nodes.map((n) => n.id), edges);
    const roots = findRoots(nodes.map((n) => n.id), adjacency);

    return { nodes, edges, roots, direction: resolved.direction };
  }
}

/** Build a typed {@link OperationDescriptor}. */
function descriptor(type: string, params: Record<string, unknown>, label?: string): OperationDescriptor {
  return label ? { type, params, label } : { type, params };
}

function nodeMetadata(node: PlanNode): Metadata {
  const meta: Record<string, MetadataValue> = { aiGenerated: true };
  if (node.type) meta.role = node.type;
  if (node.description) meta.description = node.description;
  if (node.metadata) Object.assign(meta, node.metadata);
  return meta;
}

function documentMetadata(plan: DiagramPlan): Record<string, MetadataValue> {
  const meta: Record<string, MetadataValue> = {
    diagramType: plan.diagramType,
    generatedBy: 'ai',
  };
  if (plan.description) meta.description = plan.description;
  return meta;
}

function routingForKind(kind: LayoutKind): RoutingKind {
  switch (kind) {
    case 'layered':
    case 'tree':
      return 'orthogonal';
    case 'linear':
      return 'straight';
    default:
      return 'curved';
  }
}
