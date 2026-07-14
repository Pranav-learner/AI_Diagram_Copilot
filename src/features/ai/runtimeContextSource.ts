/**
 * Adapts the live runtime + canvas bridge to the AI layer's read-side port.
 * Editing needs both the current document and the current selection; this is the
 * one place the app wires them to {@link DiagramContextSource}.
 */

import type { DiagramContextSource, DiagramChangeSource } from '@/ai';
import type { DiagramRuntime, CanvasBridge } from '@/diagram-engine';

export function createRuntimeContextSource(runtime: DiagramRuntime, bridge: CanvasBridge): DiagramContextSource {
  return {
    getDocument: () => runtime.getDocument(),
    getSelection: () => bridge.getSelection(),
  };
}

/**
 * Adapts the runtime to the Understanding Engine's change-source port. The engine
 * pulls the document + version and re-syncs its Semantic Graph on every commit —
 * so Explain Mode always reasons over the current diagram.
 */
export function createRuntimeChangeSource(runtime: DiagramRuntime): DiagramChangeSource {
  return {
    getDocument: () => runtime.getDocument(),
    getVersion: () => runtime.getVersion(),
    subscribe: (listener) => runtime.subscribe(() => listener()),
  };
}
