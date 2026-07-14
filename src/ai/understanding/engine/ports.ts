/**
 * Ports — the decoupling seam between the Understanding Engine and the app.
 *
 * The engine never imports the diagram runtime. Instead the app wires the runtime
 * to this port: `getDocument`/`getVersion` read the live state and `subscribe`
 * fires after every commit. Mirrors the AI Foundation's {@link DiagramContextSource}
 * pattern — the engine depends on `@/dsl` *types* only, so it stays testable and
 * renderer/runtime-agnostic.
 */

import type { DiagramDocument } from '@/dsl';

export interface DiagramChangeSource {
  /** The current immutable document. */
  getDocument(): DiagramDocument;
  /** Monotonic version, if the host tracks one. Enables cheap "did anything change?". */
  getVersion?(): number;
  /** Register a listener fired after every commit; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}
