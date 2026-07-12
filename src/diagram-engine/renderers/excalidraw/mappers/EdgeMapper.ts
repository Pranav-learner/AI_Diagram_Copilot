/**
 * Edge mapping — DSL {@link DiagramEdge} ⇄ Excalidraw arrow element.
 *
 * An edge renders to an `arrow` element bound to its source/target nodes
 * (`startBinding`/`endBinding`, so Excalidraw re-routes as nodes move), with
 * `points` seeded from node centres + waypoints, and arrowheads/label mapped
 * across. Routing intent and waypoints are escrowed (Excalidraw has no first-class
 * "orthogonal" flag), so the DSL semantics survive the round-trip. A missing
 * endpoint is a warning, not a failure — the arrow still renders, unbound.
 */

import type { DiagramEdge, DiagramDocument, DiagramNode, Style } from '@/dsl';
import { mergeStyles } from '@/dsl';
import type { EdgeId } from '@/dsl';
import {
  ARROWHEAD_TO_EX,
  exToArrowhead,
  LABEL_ID_SUFFIX,
  ELEMENT_DEFAULTS,
  FONT_FAMILY,
  ROUNDNESS,
  EXCALIDRAW_META_KEY,
} from '../constants';
import { makeBaseElement } from '../elementFactory';
import { readElementEscrow, wrapCustomData } from '../escrow';
import type { RendererContext } from '../../../renderer/RendererContext';
import { styleToElement, elementToStyle, fontFromStyle } from './StyleMapper';
import type {
  ExElement,
  ExLinearElement,
  ExTextElement,
  ExPointBinding,
  ExRoundness,
} from '../types';

const BINDING_GAP = 4;

function center(node: DiagramNode): { x: number; y: number } {
  return { x: node.position.x + node.size.width / 2, y: node.position.y + node.size.height / 2 };
}

function resolveEdgeStyle(
  edge: DiagramEdge,
  doc: DiagramDocument,
  ctx: RendererContext,
): Style | undefined {
  const themeDefault = ctx.config.theme?.defaults['edge'];
  const refStyle = edge.styleRef ? doc.styles[edge.styleRef]?.style : undefined;
  if (!themeDefault && !refStyle && !edge.style) return undefined;
  return mergeStyles(themeDefault, refStyle, edge.style);
}

function routingRoundness(routing: DiagramEdge['routing']): ExRoundness {
  return routing === 'curved' ? { type: ROUNDNESS.PROPORTIONAL } : null;
}

// ── DSL → Excalidraw ────────────────────────────────────────────────────────

export function renderEdge(
  edge: DiagramEdge,
  doc: DiagramDocument,
  ctx: RendererContext,
): ExElement[] {
  const source = doc.nodes[edge.source.nodeId];
  const target = doc.nodes[edge.target.nodeId];
  if (!source || !target) {
    ctx.warn({
      code: 'edge.danglingEndpoint',
      message: `Edge "${edge.id}" references a missing node; rendered unbound`,
      entityId: edge.id,
    });
  }

  const start = source ? center(source) : { x: 0, y: 0 };
  const end = target ? center(target) : { x: start.x + 100, y: start.y };

  const points: [number, number][] = [[0, 0]];
  for (const wp of edge.waypoints ?? []) points.push([wp.x - start.x, wp.y - start.y]);
  points.push([end.x - start.x, end.y - start.y]);

  const mapped = styleToElement(resolveEdgeStyle(edge, doc, ctx));
  const hasLabel = Boolean(edge.label?.text);
  const labelId = edge.id + LABEL_ID_SUFFIX;

  const startBinding: ExPointBinding | null = source
    ? { elementId: source.id, focus: 0, gap: BINDING_GAP }
    : null;
  const endBinding: ExPointBinding | null = target
    ? { elementId: target.id, focus: 0, gap: BINDING_GAP }
    : null;

  const base = makeBaseElement(
    {
      id: edge.id,
      type: 'arrow',
      x: start.x,
      y: start.y,
      width: Math.max(1, Math.abs(end.x - start.x)),
      height: Math.max(1, Math.abs(end.y - start.y)),
      strokeColor: mapped.strokeColor,
      strokeWidth: mapped.strokeWidth,
      strokeStyle: mapped.strokeStyle,
      opacity: mapped.opacity,
      roundness: routingRoundness(edge.routing),
      locked: edge.locked,
      boundElements: hasLabel ? [{ type: 'text', id: labelId }] : undefined,
      customData: wrapCustomData({ v: 1, kind: 'edge', entity: edge }),
    },
    ctx.config.epoch,
  );

  const arrow: ExLinearElement = {
    ...base,
    type: 'arrow',
    points,
    lastCommittedPoint: null,
    startBinding,
    endBinding,
    startArrowhead: ARROWHEAD_TO_EX[edge.arrowheads.start],
    endArrowhead: ARROWHEAD_TO_EX[edge.arrowheads.end],
  };

  const elements: ExElement[] = [arrow];
  if (hasLabel && edge.label) elements.push(makeEdgeLabel(edge, ctx.config.epoch));
  return elements;
}

function makeEdgeLabel(edge: DiagramEdge, epoch: number): ExTextElement {
  const font = fontFromStyle(edge.label?.style);
  const labelId = edge.id + LABEL_ID_SUFFIX;
  const base = makeBaseElement(
    {
      id: labelId,
      type: 'text',
      x: 0,
      y: 0,
      width: 0,
      height: (font.fontSize ?? ELEMENT_DEFAULTS.fontSize) * ELEMENT_DEFAULTS.lineHeight,
      strokeColor: font.color,
      customData: wrapCustomData({ v: 1, kind: 'label', ownerId: edge.id }),
    },
    epoch,
  );
  return {
    ...base,
    type: 'text',
    text: edge.label?.text ?? '',
    originalText: edge.label?.text ?? '',
    fontSize: font.fontSize ?? ELEMENT_DEFAULTS.fontSize,
    fontFamily: font.fontFamily ?? FONT_FAMILY.handDrawn,
    textAlign: font.textAlign ?? 'center',
    verticalAlign: 'middle',
    containerId: edge.id,
    lineHeight: ELEMENT_DEFAULTS.lineHeight,
  };
}

// ── Excalidraw → DSL ────────────────────────────────────────────────────────

export function parseEdge(
  arrow: ExLinearElement,
  boundText: ExTextElement | undefined,
  ctx: RendererContext,
): DiagramEdge {
  const escrow = readElementEscrow(arrow);
  const arrowheads = {
    start: exToArrowhead(arrow.startArrowhead),
    end: exToArrowhead(arrow.endArrowhead),
  };

  if (escrow?.kind === 'edge') {
    const entity = escrow.entity;
    const derived = elementToStyle(arrow);
    const style =
      entity.style || Object.keys(derived).length > 0
        ? mergeStyles(entity.style, derived)
        : undefined;
    const label = boundText
      ? { ...(entity.label ?? { text: boundText.text }), text: boundText.text }
      : entity.label;
    return {
      ...entity,
      source: arrow.startBinding ? { ...entity.source, nodeId: entity.source.nodeId } : entity.source,
      target: arrow.endBinding ? { ...entity.target, nodeId: entity.target.nodeId } : entity.target,
      arrowheads,
      style,
      label,
    } as DiagramEdge;
  }

  // Manually-drawn arrow: reconstruct from bindings.
  const now = ctx.clock.now();
  if (!arrow.startBinding || !arrow.endBinding) {
    ctx.warn({
      code: 'edge.unbound',
      message: `Arrow "${arrow.id}" is not bound to two nodes; edge endpoints may be empty`,
      entityId: arrow.id,
    });
  }
  return {
    id: arrow.id as EdgeId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    metadata: { [EXCALIDRAW_META_KEY]: { seed: arrow.seed, versionNonce: arrow.versionNonce } },
    source: { nodeId: (arrow.startBinding?.elementId ?? '') as DiagramEdge['source']['nodeId'] },
    target: { nodeId: (arrow.endBinding?.elementId ?? '') as DiagramEdge['target']['nodeId'] },
    routing: 'straight',
    arrowheads,
    style: Object.keys(elementToStyle(arrow)).length > 0 ? elementToStyle(arrow) : undefined,
    label: boundText ? { text: boundText.text } : undefined,
    locked: arrow.locked || undefined,
  } as DiagramEdge;
}
