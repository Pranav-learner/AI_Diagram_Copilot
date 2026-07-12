/**
 * The node model.
 *
 * Nodes are a **discriminated union on `type`** — but only where the *payload*
 * genuinely differs. Text carries text, images carry a src, containers carry
 * children; those are distinct union members. The long list of *semantic* kinds
 * (database, service, queue, cache, api, …) does **not** each become a union
 * member — they are all the same structure (a labeled shape) and collapse into
 * {@link ShapeNode} via `shape` (the visual primitive) + `semantic` (the domain
 * meaning). Adding a new semantic type is therefore a runtime registry entry
 * (see {@link NodeTypeRegistry}), not a change to this union.
 *
 * This separation — visual primitive vs. domain meaning — is the core
 * extensibility decision of the whole model.
 */

import type { EntityBase } from '../core/entity';
import type { NodeId, GroupId, LayerId, StyleId, TagId } from '../primitives/ids';
import type { Point, Size } from '../primitives/geometry';
import type { Style } from './style';

/** Visual primitives a shape node can render as. A small, closed set. */
export type ShapeKind =
  | 'rectangle'
  | 'roundedRectangle'
  | 'ellipse'
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'parallelogram'
  | 'hexagon'
  | 'cylinder'
  | 'cloud';

/**
 * Domain meaning of a shape node. The named members cover common cases and give
 * autocomplete; the `(string & {})` arm keeps the type **open** so registry-
 * driven custom types are assignable without editing this union.
 */
export type SemanticType =
  | 'decision'
  | 'database'
  | 'service'
  | 'queue'
  | 'cache'
  | 'api'
  | 'user'
  | 'cloud'
  | 'server'
  | 'process'
  | 'terminator'
  | 'custom'
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  | (string & {});

/** How a shape's label is positioned relative to the shape. */
export type LabelPlacement = 'inside' | 'top' | 'bottom' | 'left' | 'right';

/** A short label attached to a node. */
export interface NodeLabel {
  readonly text: string;
  readonly placement?: LabelPlacement;
  readonly style?: Style;
}

/** Fields common to every node kind. */
export interface NodeCommon<Type extends string> extends EntityBase<NodeId> {
  readonly type: Type;
  readonly position: Point;
  readonly size: Size;
  /** Rotation in radians, clockwise. */
  readonly rotation: number;
  /** Stacking order — higher draws on top. */
  readonly z: number;
  readonly label?: NodeLabel;
  /** Inline style override (highest precedence). */
  readonly style?: Style;
  /** Reference into the document {@link StyleTable}. */
  readonly styleRef?: StyleId;
  readonly groupId?: GroupId;
  readonly layerId?: LayerId;
  readonly tagIds?: readonly TagId[];
  readonly locked?: boolean;
}

/** A shape: the workhorse node. `shape` = how it draws, `semantic` = what it means. */
export interface ShapeNode extends NodeCommon<'shape'> {
  readonly shape: ShapeKind;
  readonly semantic?: SemanticType;
}

/** A standalone text node. */
export interface TextNode extends NodeCommon<'text'> {
  readonly text: string;
}

/** A raster/vector image referenced by `src` (url or data-uri — DSL is agnostic). */
export interface ImageNode extends NodeCommon<'image'> {
  readonly src: string;
  readonly alt?: string;
}

/** An icon referenced by a registry/name key. */
export interface IconNode extends NodeCommon<'icon'> {
  readonly icon: string;
}

/** A visual container that *owns* child nodes by id (distinct from a group). */
export interface ContainerNode extends NodeCommon<'container'> {
  readonly childIds: readonly NodeId[];
}

/** Any node. Discriminate on `type`. */
export type DiagramNode =
  | ShapeNode
  | TextNode
  | ImageNode
  | IconNode
  | ContainerNode;

/** The set of built-in node `type` discriminants. */
export type NodeType = DiagramNode['type'];
