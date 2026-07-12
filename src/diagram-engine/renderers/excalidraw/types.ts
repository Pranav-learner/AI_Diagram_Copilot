/**
 * Plain JSON types mirroring Excalidraw's on-disk scene shape.
 *
 * These are the engine's *own* structural types — we deliberately do NOT import
 * `@excalidraw/excalidraw`. That keeps the engine pure data (no runtime coupling)
 * and sidesteps Excalidraw's branded compile-time types (`Radians`,
 * `LocalPoint`, `GroupId`, `FileId`) which fight plain-object construction. The
 * live `CanvasEngine` already treats scene elements as opaque objects, so this
 * JSON is exactly what the future `CanvasBridge` hands to `setScene`.
 *
 * Field names/semantics are verified against
 * `node_modules/@excalidraw/excalidraw/dist/types/excalidraw/element/types.d.ts`.
 */

export type ExElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'text'
  | 'image'
  | 'arrow'
  | 'line'
  | 'frame'
  | 'freedraw'
  | 'embeddable';

export type ExFillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'zigzag';
export type ExStrokeStyle = 'solid' | 'dashed' | 'dotted';
export type ExTextAlign = 'left' | 'center' | 'right';
export type ExVerticalAlign = 'top' | 'middle' | 'bottom';

/** Excalidraw arrowheads (superset of the DSL's); `null` = none. */
export type ExArrowhead =
  | 'arrow'
  | 'bar'
  | 'dot'
  | 'circle'
  | 'circle_outline'
  | 'triangle'
  | 'triangle_outline'
  | 'diamond'
  | 'diamond_outline'
  | null;

export type ExRoundness = { readonly type: number; readonly value?: number } | null;

export interface ExBoundElement {
  readonly id: string;
  readonly type: 'text' | 'arrow';
}

export interface ExPointBinding {
  readonly elementId: string;
  readonly focus: number;
  readonly gap: number;
}

/** Fields common to every element (`_ExcalidrawElementBase`). */
export interface ExElementBase {
  readonly id: string;
  readonly type: ExElementType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Rotation in radians (matches the DSL's `rotation`). */
  readonly angle: number;
  readonly strokeColor: string;
  readonly backgroundColor: string;
  readonly fillStyle: ExFillStyle;
  readonly strokeWidth: number;
  readonly strokeStyle: ExStrokeStyle;
  readonly roughness: number;
  readonly opacity: number;
  readonly roundness: ExRoundness;
  readonly seed: number;
  readonly version: number;
  readonly versionNonce: number;
  readonly updated: number;
  readonly isDeleted: boolean;
  readonly groupIds: readonly string[];
  readonly frameId: string | null;
  readonly boundElements: readonly ExBoundElement[] | null;
  readonly link: string | null;
  readonly locked: boolean;
  readonly customData?: Record<string, unknown>;
}

export interface ExGenericElement extends ExElementBase {
  readonly type: 'rectangle' | 'ellipse' | 'diamond' | 'frame' | 'embeddable';
}

export interface ExTextElement extends ExElementBase {
  readonly type: 'text';
  readonly text: string;
  readonly originalText: string;
  readonly fontSize: number;
  readonly fontFamily: number;
  readonly textAlign: ExTextAlign;
  readonly verticalAlign: ExVerticalAlign;
  /** Non-null when this text is bound inside a shape/arrow (a label). */
  readonly containerId: string | null;
  readonly lineHeight: number;
}

export interface ExLinearElement extends ExElementBase {
  readonly type: 'arrow' | 'line';
  readonly points: readonly (readonly [number, number])[];
  readonly lastCommittedPoint: readonly [number, number] | null;
  readonly startBinding: ExPointBinding | null;
  readonly endBinding: ExPointBinding | null;
  readonly startArrowhead: ExArrowhead;
  readonly endArrowhead: ExArrowhead;
}

export interface ExImageElement extends ExElementBase {
  readonly type: 'image';
  readonly fileId: string | null;
  readonly scale: readonly [number, number];
  readonly status: 'pending' | 'saved' | 'error';
}

export type ExElement =
  | ExGenericElement
  | ExTextElement
  | ExLinearElement
  | ExImageElement;

/** The slice of Excalidraw `appState` the engine reads/writes (viewport). */
export interface ExAppState {
  readonly scrollX?: number;
  readonly scrollY?: number;
  readonly zoom?: { readonly value: number };
  readonly viewBackgroundColor?: string;
  readonly gridSize?: number | null;
  readonly gridModeEnabled?: boolean;
  /** Passthrough for any other appState fields we don't interpret. */
  readonly [key: string]: unknown;
}

export interface ExBinaryFile {
  readonly id: string;
  readonly dataURL: string;
  readonly mimeType: string;
  readonly created: number;
}

/** A complete Excalidraw scene: elements + the viewport slice + image files. */
export interface ExcalidrawScene {
  readonly elements: readonly ExElement[];
  readonly appState: ExAppState;
  readonly files: Record<string, ExBinaryFile>;
}
