import type { ToolType } from '@excalidraw/excalidraw/types';
import type { CanvasTool } from '../types/canvas';

/**
 * Bidirectional map between the app's {@link CanvasTool} vocabulary and
 * Excalidraw's `ToolType`. Isolated here so the mapping is the single place that
 * knows Excalidraw's tool names.
 */
const TO_EXCALIDRAW: Record<CanvasTool, ToolType> = {
  selection: 'selection',
  hand: 'hand',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  arrow: 'arrow',
  line: 'line',
  freedraw: 'freedraw',
  text: 'text',
  image: 'image',
};

const FROM_EXCALIDRAW = new Map<string, CanvasTool>(
  Object.entries(TO_EXCALIDRAW).map(([tool, type]) => [type, tool as CanvasTool]),
);

export function toExcalidrawTool(tool: CanvasTool): ToolType {
  return TO_EXCALIDRAW[tool];
}

/** Map an Excalidraw tool type back to a {@link CanvasTool}, defaulting to selection. */
export function fromExcalidrawTool(type: string): CanvasTool {
  return FROM_EXCALIDRAW.get(type) ?? 'selection';
}
