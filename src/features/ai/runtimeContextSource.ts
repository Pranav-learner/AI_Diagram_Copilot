/**
 * Adapts the live runtime + canvas bridge to the AI layer's read-side port.
 * Editing needs both the current document and the current selection; this is the
 * one place the app wires them to {@link DiagramContextSource}.
 */

import type { DiagramContextSource } from '@/ai';
import type { DiagramRuntime, CanvasBridge } from '@/diagram-engine';

export function createRuntimeContextSource(runtime: DiagramRuntime, bridge: CanvasBridge): DiagramContextSource {
  return {
    getDocument: () => runtime.getDocument(),
    getSelection: () => bridge.getSelection(),
  };
}
