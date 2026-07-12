/**
 * DiagramUnderstanding — a semantic model of the *current* diagram.
 *
 * Editing (unlike generation) reasons about what already exists. This layer
 * reads the live document + selection through the {@link DiagramContextSource}
 * port and produces a compact, **semantic** snapshot — nodes (id, label, role,
 * size, position, group, colour, selected), edges, groups/hierarchy, selection,
 * and overall bounds. It is the single source of truth for two consumers:
 *   • the prompt (rendered as a JSON block so the model can reference elements), and
 *   • the {@link ReferenceResolver} (resolving "the database", "the largest node").
 * No renderer details leak — only meaning and geometry the app owns.
 */

import type { DiagramDocument, DiagramNode, DiagramEdge, DiagramGroup, Point, Size } from '@/dsl';
import type { DiagramContextSource } from '../planning/ContextBuilder';
import { estimateTokens } from '../core/tokens';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UnderstoodNode {
  readonly id: string;
  readonly label: string;
  /** Semantic role (shape node `semantic`), if any. */
  readonly role?: string;
  readonly shape?: string;
  readonly position: Point;
  readonly size: Size;
  readonly area: number;
  /** Stacking order (higher = on top). Used by reorder edits; not sent to the model. */
  readonly z: number;
  /** Id of the group this node belongs to, if any. */
  readonly groupId?: string;
  /** Current fill colour, if the node has one. */
  readonly color?: string;
  readonly selected: boolean;
}

export interface UnderstoodEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceLabel: string;
  readonly targetLabel: string;
  readonly label?: string;
}

export interface UnderstoodGroup {
  readonly id: string;
  readonly label: string;
  readonly memberIds: readonly string[];
  readonly bounds: Rect;
}

export interface DiagramUnderstanding {
  readonly nodes: readonly UnderstoodNode[];
  readonly edges: readonly UnderstoodEdge[];
  readonly groups: readonly UnderstoodGroup[];
  readonly selection: readonly string[];
  readonly bounds: Rect;
  readonly counts: { readonly nodes: number; readonly edges: number; readonly groups: number };
  /** True when elements were omitted to fit the token budget. */
  readonly truncated: boolean;
}

export interface UnderstandOptions {
  readonly maxNodes?: number;
  readonly maxEdges?: number;
}

const DEFAULT_MAX_NODES = 200;
const DEFAULT_MAX_EDGES = 400;

/** Build a {@link DiagramUnderstanding} from the current diagram + selection. */
export function understandDiagram(source: DiagramContextSource, options: UnderstandOptions = {}): DiagramUnderstanding {
  const doc = source.getDocument();
  const selection = new Set(source.getSelection?.() ?? []);
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxEdges = options.maxEdges ?? DEFAULT_MAX_EDGES;

  const nodeGroup = buildNodeGroupIndex(doc);
  const allNodes = Object.values(doc.nodes);
  const nodes = allNodes
    .slice(0, maxNodes)
    .map((n) => understandNode(n, nodeGroup.get(n.id), selection.has(n.id)));

  const nodeLabels = new Map(nodes.map((n) => [n.id, n.label]));
  const allEdges = Object.values(doc.edges);
  const edges = allEdges.slice(0, maxEdges).map((e) => understandEdge(e, nodeLabels));

  const groups = Object.values(doc.groups).map((g) => understandGroup(g, doc));
  const bounds = boundsOf(nodes.map((n) => ({ ...n.position, ...n.size })));

  return {
    nodes,
    edges,
    groups,
    selection: [...selection],
    bounds,
    counts: { nodes: allNodes.length, edges: allEdges.length, groups: groups.length },
    truncated: allNodes.length > nodes.length || allEdges.length > edges.length,
  };
}

/**
 * Render the understanding as a compact fenced JSON block for prompt injection.
 * Ids are surfaced prominently so the model references them directly.
 */
export function renderUnderstanding(u: DiagramUnderstanding): string {
  const payload = {
    nodes: u.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      role: n.role,
      size: [Math.round(n.size.width), Math.round(n.size.height)],
      pos: [Math.round(n.position.x), Math.round(n.position.y)],
      group: n.groupId,
      color: n.color,
      selected: n.selected || undefined,
    })),
    edges: u.edges.map((e) => ({ id: e.id, from: e.source, to: e.target, label: e.label })),
    groups: u.groups.map((g) => ({ id: g.id, label: g.label, members: g.memberIds })),
    selection: u.selection,
    truncated: u.truncated || undefined,
  };
  return ['```json', JSON.stringify(payload), '```'].join('\n');
}

/** Estimated token cost of the rendered understanding. */
export function understandingTokens(u: DiagramUnderstanding): number {
  return estimateTokens(renderUnderstanding(u));
}

// ── Internals ────────────────────────────────────────────────────────────────

function buildNodeGroupIndex(doc: DiagramDocument): Map<string, string> {
  const index = new Map<string, string>();
  for (const group of Object.values(doc.groups)) {
    for (const child of group.childIds) if (child in doc.nodes) index.set(child, group.id);
  }
  return index;
}

function understandNode(node: DiagramNode, groupId: string | undefined, selected: boolean): UnderstoodNode {
  return {
    id: node.id,
    label: labelOf(node),
    role: node.type === 'shape' ? node.semantic : undefined,
    shape: node.type === 'shape' ? node.shape : undefined,
    position: node.position,
    size: node.size,
    area: node.size.width * node.size.height,
    z: node.z,
    groupId,
    color: node.style?.fill?.color,
    selected,
  };
}

function labelOf(node: DiagramNode): string {
  if ('label' in node && node.label?.text) return node.label.text;
  if (node.type === 'text') return node.text;
  return node.id;
}

function understandEdge(edge: DiagramEdge, labels: Map<string, string>): UnderstoodEdge {
  const source = edge.source.nodeId;
  const target = edge.target.nodeId;
  return {
    id: edge.id,
    source,
    target,
    sourceLabel: labels.get(source) ?? source,
    targetLabel: labels.get(target) ?? target,
    label: edge.label?.text,
  };
}

function understandGroup(group: DiagramGroup, doc: DiagramDocument): UnderstoodGroup {
  const memberIds = group.childIds.filter((id) => id in doc.nodes);
  const rects = memberIds.map((id) => {
    const n = doc.nodes[id]!;
    return { ...n.position, ...n.size };
  });
  return { id: group.id, label: group.name ?? group.id, memberIds, bounds: boundsOf(rects) };
}

function boundsOf(rects: ReadonlyArray<{ x: number; y: number; width: number; height: number }>): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
