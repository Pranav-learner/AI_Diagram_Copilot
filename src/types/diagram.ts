/**
 * A persisted diagram as returned by the backend. `data` is an opaque document
 * (today an Excalidraw scene envelope; later Diagram DSL) — the canvas feature
 * owns its interpretation, the API treats it as a black box.
 */
export interface DiagramResponse {
  id: string;
  projectId: string;
  data: unknown;
  /** Monotonic save counter for optimistic concurrency. */
  version: number;
  createdAt: string;
  updatedAt: string;
}
