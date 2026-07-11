import { ROUNDNESS } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ElementStyleUpdate } from '../types/canvas';
import { fromArrowheadStyle } from './normalizeElement';

const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Translate a type-agnostic {@link ElementStyleUpdate} into the concrete
 * Excalidraw field changes for a specific element. Only fields relevant to the
 * element's type are emitted, so applying an update to a mixed selection does
 * the right thing per element. The result feeds `newElementWith`.
 */
export function toElementUpdates(
  element: ExcalidrawElement,
  update: ElementStyleUpdate,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  // Common style
  if (update.strokeColor !== undefined) patch.strokeColor = update.strokeColor;
  if (update.backgroundColor !== undefined)
    patch.backgroundColor = update.backgroundColor;
  if (update.opacity !== undefined) patch.opacity = clamp(update.opacity, 0, 100);
  if (update.strokeWidth !== undefined)
    patch.strokeWidth = clamp(update.strokeWidth, 0.5, 64);
  if (update.rounded !== undefined)
    patch.roundness = update.rounded
      ? { type: ROUNDNESS.ADAPTIVE_RADIUS }
      : null;

  // Geometry
  if (update.x !== undefined) patch.x = update.x;
  if (update.y !== undefined) patch.y = update.y;
  if (update.width !== undefined) patch.width = Math.max(1, update.width);
  if (update.height !== undefined) patch.height = Math.max(1, update.height);
  if (update.rotation !== undefined)
    patch.angle = normalizeDegrees(update.rotation) * DEG_TO_RAD;

  // Text
  if (element.type === 'text') {
    if (update.text !== undefined) {
      patch.text = update.text;
      patch.originalText = update.text;
    }
    if (update.fontSize !== undefined) {
      const size = clamp(update.fontSize, 4, 256);
      patch.fontSize = size;
      // Scale the text box with the font so it doesn't clip/overflow.
      const ratio = element.fontSize ? size / element.fontSize : 1;
      if (update.height === undefined)
        patch.height = Math.max(1, element.height * ratio);
      if (update.width === undefined)
        patch.width = Math.max(1, element.width * ratio);
    }
    if (update.fontFamily !== undefined) patch.fontFamily = update.fontFamily;
    if (update.textAlign !== undefined) patch.textAlign = update.textAlign;
  }

  // Arrow / line
  if (element.type === 'arrow' || element.type === 'line') {
    if (update.startArrowhead !== undefined)
      patch.startArrowhead = fromArrowheadStyle(update.startArrowhead);
    if (update.endArrowhead !== undefined)
      patch.endArrowhead = fromArrowheadStyle(update.endArrowhead);
  }

  return patch;
}
