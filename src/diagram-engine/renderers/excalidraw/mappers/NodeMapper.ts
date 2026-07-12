/**
 * Node mapping — DSL {@link DiagramNode} ⇄ Excalidraw element(s).
 *
 * A node renders to a primary element plus, for shapes/containers with a label,
 * a **bound text** element (`containerId`) so the label shows inside the shape
 * and reverse-maps back into `node.label` (not a stray text node). Identity is
 * preserved by construction (`element.id === node.id`) and by escrowing the whole
 * DSL node in `customData`; geometry/label/mapped-style are overlaid from the
 * element on parse so manual canvas edits are captured, while un-mappable DSL
 * data survives via the escrow (see {@link escrow}).
 */

import type { DiagramNode, DiagramDocument, Style, NodeId, ShapeKind } from '@/dsl';
import { mergeStyles } from '@/dsl';
import {
  SHAPE_TO_EX_TYPE,
  EX_TYPE_TO_SHAPE,
  LABEL_ID_SUFFIX,
  ELEMENT_DEFAULTS,
  FONT_FAMILY,
  ROUNDNESS,
  EXCALIDRAW_META_KEY,
} from '../constants';
import { makeBaseElement } from '../elementFactory';
import { readElementEscrow, wrapCustomData } from '../escrow';
import type { RendererContext } from '../../../renderer/RendererContext';
import type { Placement } from './GroupMapper';
import { styleToElement, elementToStyle, fontFromStyle } from './StyleMapper';
import type {
  ExElement,
  ExGenericElement,
  ExTextElement,
  ExImageElement,
  ExRoundness,
} from '../types';

const EMPTY_PLACEMENT: Placement = { groupIds: [], frameId: null };

/** Merge theme default → named style ref → inline style into the effective style. */
function resolveEffectiveStyle(
  node: DiagramNode,
  doc: DiagramDocument,
  ctx: RendererContext,
): Style | undefined {
  const themeDefault = ctx.config.theme?.defaults[node.type];
  const refStyle = node.styleRef ? doc.styles[node.styleRef]?.style : undefined;
  if (!themeDefault && !refStyle && !node.style) return undefined;
  return mergeStyles(themeDefault, refStyle, node.style);
}

function emptyToUndefined(style: Style): Style | undefined {
  return Object.keys(style).length > 0 ? style : undefined;
}

// ── DSL → Excalidraw ────────────────────────────────────────────────────────

export function renderNode(
  node: DiagramNode,
  doc: DiagramDocument,
  ctx: RendererContext,
  placement: Placement = EMPTY_PLACEMENT,
): ExElement[] {
  const effective = resolveEffectiveStyle(node, doc, ctx);
  const { roundness: styleRoundness, ...mapped } = styleToElement(effective);
  const epoch = ctx.config.epoch;

  const escrow = wrapCustomData({ v: 1, kind: 'node', entity: node });
  const hasLabel = node.type !== 'text' && Boolean(node.label?.text);
  const labelId = node.id + LABEL_ID_SUFFIX;

  const base = makeBaseElement(
    {
      id: node.id,
      type: 'rectangle', // refined below per node kind
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
      angle: node.rotation,
      strokeColor: mapped.strokeColor,
      backgroundColor: mapped.backgroundColor,
      strokeWidth: mapped.strokeWidth,
      strokeStyle: mapped.strokeStyle,
      opacity: mapped.opacity,
      groupIds: placement.groupIds,
      frameId: placement.frameId,
      locked: node.locked,
      boundElements: hasLabel ? [{ type: 'text', id: labelId }] : undefined,
      customData: escrow,
    },
    epoch,
  );

  const elements: ExElement[] = [];

  switch (node.type) {
    case 'shape': {
      const roundness = resolveShapeRoundness(node.shape, styleRoundness ?? null);
      elements.push({ ...base, type: SHAPE_TO_EX_TYPE[node.shape], roundness } as ExGenericElement);
      break;
    }
    case 'container':
      // A container is a frame-like backdrop; render as a rectangle backdrop so
      // its own geometry/label are visible (frame *groups* are handled elsewhere).
      elements.push({ ...base, type: 'rectangle', roundness: styleRoundness ?? null } as ExGenericElement);
      break;
    case 'icon':
      elements.push({ ...base, type: 'rectangle', roundness: styleRoundness ?? null } as ExGenericElement);
      break;
    case 'image':
      elements.push({
        ...base,
        type: 'image',
        fileId: node.id,
        scale: [1, 1],
        status: 'saved',
      } as ExImageElement);
      break;
    case 'text':
      // A standalone text node (not bound inside a container).
      elements.push(makeTextElement(node.id, node.text, effective, base, null));
      break;
  }

  if (hasLabel && node.label) {
    elements.push(makeLabel(node, effective, epoch));
  }
  return elements;
}

function resolveShapeRoundness(shape: ShapeKind, fromStyle: ExRoundness): ExRoundness {
  if (fromStyle) return fromStyle;
  return shape === 'roundedRectangle' ? { type: ROUNDNESS.ADAPTIVE } : null;
}

/** Build a standalone text element from the base (used for text nodes). */
function makeTextElement(
  id: string,
  text: string,
  style: Style | undefined,
  base: ReturnType<typeof makeBaseElement>,
  containerId: string | null,
): ExTextElement {
  const font = fontFromStyle(style);
  return {
    ...base,
    id,
    type: 'text',
    strokeColor: font.color ?? base.strokeColor,
    text,
    originalText: text,
    fontSize: font.fontSize ?? ELEMENT_DEFAULTS.fontSize,
    fontFamily: font.fontFamily ?? FONT_FAMILY.handDrawn,
    textAlign: font.textAlign ?? 'left',
    verticalAlign: 'top',
    containerId,
    lineHeight: ELEMENT_DEFAULTS.lineHeight,
  };
}

/** Build a bound label element for a shape/container/icon node. */
function makeLabel(node: DiagramNode, effective: Style | undefined, epoch: number): ExTextElement {
  const labelStyle = node.label?.style ?? effective;
  const font = fontFromStyle(labelStyle);
  const labelId = node.id + LABEL_ID_SUFFIX;
  const base = makeBaseElement(
    {
      id: labelId,
      type: 'text',
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: (font.fontSize ?? ELEMENT_DEFAULTS.fontSize) * ELEMENT_DEFAULTS.lineHeight,
      strokeColor: font.color,
      customData: wrapCustomData({ v: 1, kind: 'label', ownerId: node.id }),
    },
    epoch,
  );
  return {
    ...base,
    type: 'text',
    text: node.label?.text ?? '',
    originalText: node.label?.text ?? '',
    fontSize: font.fontSize ?? ELEMENT_DEFAULTS.fontSize,
    fontFamily: font.fontFamily ?? FONT_FAMILY.handDrawn,
    textAlign: font.textAlign ?? 'center',
    verticalAlign: 'middle',
    containerId: node.id,
    lineHeight: ELEMENT_DEFAULTS.lineHeight,
  };
}

// ── Excalidraw → DSL ────────────────────────────────────────────────────────

export function parseNode(
  primary: ExElement,
  boundText: ExTextElement | undefined,
  ctx: RendererContext,
): DiagramNode {
  const escrow = readElementEscrow(primary);
  if (escrow?.kind === 'node') {
    return overlayFromElement(escrow.entity, primary, boundText);
  }
  return reconstructNode(primary, boundText, ctx);
}

/** Refresh a known DSL node's geometry/label/style from the (possibly edited) element. */
function overlayFromElement(
  entity: DiagramNode,
  primary: ExElement,
  boundText: ExTextElement | undefined,
): DiagramNode {
  const derived = elementToStyle(primary);
  const style =
    entity.style || Object.keys(derived).length > 0
      ? mergeStyles(entity.style, derived)
      : undefined;

  const label = boundText
    ? { ...(entity.label ?? { text: boundText.text }), text: boundText.text }
    : entity.label;

  const overlaid = {
    ...entity,
    position: { x: primary.x, y: primary.y },
    size: { width: primary.width, height: primary.height },
    rotation: primary.angle,
    style,
    label,
  };

  if (entity.type === 'text' && primary.type === 'text') {
    return { ...overlaid, text: primary.text } as DiagramNode;
  }
  return overlaid as DiagramNode;
}

/** Build a fresh DSL node from a manually-created element (no escrow present). */
function reconstructNode(
  primary: ExElement,
  boundText: ExTextElement | undefined,
  ctx: RendererContext,
): DiagramNode {
  const now = ctx.clock.now();
  const common = {
    id: primary.id as NodeId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    metadata: { [EXCALIDRAW_META_KEY]: excalidrawMeta(primary) },
    position: { x: primary.x, y: primary.y },
    size: { width: primary.width, height: primary.height },
    rotation: primary.angle,
    z: 0,
    locked: primary.locked || undefined,
    style: emptyToUndefined(elementToStyle(primary)),
    label: boundText ? { text: boundText.text } : undefined,
  };

  if (primary.type === 'text') {
    return { ...common, type: 'text', text: primary.text } as DiagramNode;
  }
  if (primary.type === 'image') {
    return { ...common, type: 'image', src: '' } as DiagramNode;
  }
  const shape: ShapeKind = EX_TYPE_TO_SHAPE[primary.type] ?? 'rectangle';
  return { ...common, type: 'shape', shape } as DiagramNode;
}

/** Capture Excalidraw-only fields so `scene → DSL → scene` restores them. */
function excalidrawMeta(el: ExElement): Record<string, unknown> {
  return {
    seed: el.seed,
    versionNonce: el.versionNonce,
    roughness: el.roughness,
    fillStyle: el.fillStyle,
    strokeStyle: el.strokeStyle,
    roundness: el.roundness,
  };
}
