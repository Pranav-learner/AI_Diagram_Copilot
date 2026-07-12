/**
 * Application-side layout contracts.
 *
 * The LLM describes **relationships and hierarchy**; the application computes
 * **positions**. These types are the boundary of that responsibility split. A
 * layout algorithm takes an abstract graph (nodes with sizes + edges + optional
 * roots/direction) and returns top-left coordinates — pure geometry, no DSL, no
 * renderer, no model awareness. Adding a layout is implementing this interface
 * and registering it.
 */

/** The layout families the engine can run. Extensible via the registry. */
export type LayoutKind = 'layered' | 'tree' | 'radial' | 'mindmap' | 'grid' | 'linear';

/** Primary flow direction for directed layouts. */
export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface LayoutEdge {
  readonly source: string;
  readonly target: string;
}

export interface LayoutSpacing {
  /** Gap between sibling nodes (within a rank / ring). */
  readonly node: number;
  /** Gap between ranks / levels / rings. */
  readonly rank: number;
}

export interface LayoutInput {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  /** Hierarchy roots for tree/radial/mindmap; derived if omitted. */
  readonly roots?: readonly string[];
  readonly direction?: LayoutDirection;
  readonly spacing?: LayoutSpacing;
  /** Algorithm-specific tuning. */
  readonly options?: Readonly<Record<string, unknown>>;
}

/** A top-left position. Deliberately not the DSL `Point` — layout is DSL-free. */
export interface LayoutPosition {
  readonly x: number;
  readonly y: number;
}

export interface LayoutResult {
  /** Top-left position per node id. */
  readonly positions: Readonly<Record<string, LayoutPosition>>;
  /** Overall bounds of the laid-out graph. */
  readonly size: { readonly width: number; readonly height: number };
}

export interface LayoutAlgorithm {
  readonly kind: LayoutKind;
  compute(input: LayoutInput): LayoutResult;
}

export const DEFAULT_SPACING: LayoutSpacing = { node: 60, rank: 90 };
