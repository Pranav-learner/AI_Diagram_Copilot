import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { CanvasElementType, SelectedElement } from '../types/canvas';

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

/**
 * Convert an Excalidraw element into the inspector's normalized, read-only
 * {@link SelectedElement}. `layer` is the element's 1-based paint order, which
 * the caller supplies from the element's index in the ordered scene array.
 */
export function normalizeElement(
  element: ExcalidrawElement,
  layer: number,
): SelectedElement {
  return {
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
    layer,
  };
}
