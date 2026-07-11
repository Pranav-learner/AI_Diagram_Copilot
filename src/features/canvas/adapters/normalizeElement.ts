import type {
  Arrowhead,
  ExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import type {
  ArrowheadStyle,
  CanvasElementType,
  SelectedElement,
  TextAlign,
} from '../types/canvas';

const KNOWN_TYPES: ReadonlySet<string> = new Set<CanvasElementType>([
  'rectangle',
  'ellipse',
  'diamond',
  'arrow',
  'line',
  'freedraw',
  'text',
  'image',
  'frame',
  'embeddable',
]);

function toCanvasType(type: string): CanvasElementType {
  return KNOWN_TYPES.has(type) ? (type as CanvasElementType) : 'unknown';
}

/** Radians → whole degrees in the range [0, 360). */
function radiansToDegrees(angle: number): number {
  const deg = Math.round((angle * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/** Map an Excalidraw arrowhead to the inspector's curated subset. */
export function toArrowheadStyle(head: Arrowhead | null): ArrowheadStyle {
  switch (head) {
    case null:
      return 'none';
    case 'bar':
      return 'bar';
    case 'dot':
    case 'circle':
    case 'circle_outline':
      return 'dot';
    case 'triangle':
    case 'triangle_outline':
      return 'triangle';
    case 'diamond':
    case 'diamond_outline':
      return 'diamond';
    default:
      return 'arrow';
  }
}

/** Map the inspector's arrowhead style back to an Excalidraw arrowhead. */
export function fromArrowheadStyle(style: ArrowheadStyle): Arrowhead | null {
  return style === 'none' ? null : style;
}

/**
 * Convert an Excalidraw element into the inspector's normalized
 * {@link SelectedElement}. `layer` is the element's 1-based paint order.
 */
export function normalizeElement(
  element: ExcalidrawElement,
  layer: number,
): SelectedElement {
  const base: SelectedElement = {
    id: element.id,
    type: toCanvasType(element.type),
    x: Math.round(element.x),
    y: Math.round(element.y),
    width: Math.round(element.width),
    height: Math.round(element.height),
    rotation: radiansToDegrees(element.angle),
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    opacity: Math.round(element.opacity),
    strokeWidth: element.strokeWidth,
    rounded: element.roundness != null,
    layer,
  };

  if (element.type === 'text') {
    base.text = element.text;
    base.fontSize = Math.round(element.fontSize);
    base.fontFamily = element.fontFamily;
    base.textAlign = element.textAlign as TextAlign;
  }

  if (element.type === 'arrow' || element.type === 'line') {
    base.startArrowhead = toArrowheadStyle(element.startArrowhead);
    base.endArrowhead = toArrowheadStyle(element.endArrowhead);
  }

  return base;
}
