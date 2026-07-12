/**
 * Shared, renderer-agnostic types for the diagram engine.
 *
 * Nothing here (or anywhere in the engine core) references Excalidraw, React, or
 * the backend. The engine only understands the Diagram DSL and the generic
 * {@link Renderer} contract.
 */

/** An id-keyed collection — mirrors the DSL's normalized-map convention. */
export type Keyed<T> = Record<string, T>;

/**
 * A non-fatal issue raised during rendering/parsing (e.g. an edge pointing at a
 * missing node). Collected rather than thrown, so a partially-broken document
 * still renders what it can. `code` is a stable machine-readable string.
 */
export interface Warning {
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
}
