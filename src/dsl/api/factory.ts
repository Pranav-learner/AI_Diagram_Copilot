/**
 * Pure entity builders.
 *
 * Builders take a {@link BuildContext} (an id factory + clock) plus a
 * base-field-free *input spec*, and return a fully-formed, immutable entity with
 * id, revision, and timestamps filled in. They never touch a document — they
 * only mint entities. The {@link DiagramModel} composes them with operations.
 *
 * `buildNode` optionally consults a {@link NodeTypeRegistry}: given a semantic
 * type, it resolves the default shape/size/style/label — which is how a
 * registered custom node type materializes without any bespoke code.
 */

import type { IdFactory, NodeId, StyleId, GroupId, LayerId, TagId } from '../primitives/ids';
import type { Clock } from '../primitives/scalars';
import type { Point, Size } from '../primitives/geometry';
import { ORIGIN } from '../primitives/geometry';
import type { Metadata } from '../core/metadata';
import { newEntityBase } from '../core/entity';
import type {
  DiagramNode,
  ShapeKind,
  SemanticType,
  NodeLabel,
} from '../model/node';
import type { DiagramEdge, Endpoint, RoutingKind, Arrowheads, EdgeLabel } from '../model/edge';
import { DEFAULT_ARROWHEADS } from '../model/edge';
import type { DiagramGroup, GroupKind, GroupChildId } from '../model/group';
import type { Layer } from '../model/layer';
import type { DiagramTag } from '../model/tag';
import type { Annotation, AnnotationTarget } from '../model/annotation';
import type { DiagramComment } from '../model/comment';
import type { NamedStyle, Style } from '../model/style';
import type { NodeTypeRegistry } from '../model/registry';

/** Everything a builder needs to mint an entity. */
export interface BuildContext {
  readonly ids: IdFactory;
  readonly clock: Clock;
}

export const DEFAULT_NODE_SIZE: Size = { width: 120, height: 64 };

/** Fields common to every node input. */
interface NodeCommonInput {
  readonly position?: Point;
  readonly size?: Size;
  readonly rotation?: number;
  readonly z?: number;
  readonly label?: NodeLabel;
  readonly style?: Style;
  readonly styleRef?: StyleId;
  readonly groupId?: GroupId;
  readonly layerId?: LayerId;
  readonly tagIds?: readonly TagId[];
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

/** Discriminated input for {@link buildNode}. Base fields are supplied for you. */
export type NewNode =
  | ({ readonly type: 'shape'; readonly shape?: ShapeKind; readonly semantic?: SemanticType } & NodeCommonInput)
  | ({ readonly type: 'text'; readonly text: string } & NodeCommonInput)
  | ({ readonly type: 'image'; readonly src: string; readonly alt?: string } & NodeCommonInput)
  | ({ readonly type: 'icon'; readonly icon: string } & NodeCommonInput)
  | ({ readonly type: 'container'; readonly childIds?: readonly NodeId[] } & NodeCommonInput);

function commonNodeFields(input: NodeCommonInput, size: Size) {
  return {
    position: input.position ?? ORIGIN,
    size: input.size ?? size,
    rotation: input.rotation ?? 0,
    z: input.z ?? 0,
    label: input.label,
    style: input.style,
    styleRef: input.styleRef,
    groupId: input.groupId,
    layerId: input.layerId,
    tagIds: input.tagIds,
    locked: input.locked,
  };
}

/**
 * Build a node. For shape nodes with a `semantic` but no explicit `shape`, the
 * registry (if supplied) resolves the default shape/size/style/label; otherwise
 * `shape` defaults to `rectangle`.
 */
export function buildNode(
  ctx: BuildContext,
  input: NewNode,
  registry?: NodeTypeRegistry,
): DiagramNode {
  const base = newEntityBase(ctx.ids.node(), ctx.clock, input.metadata);

  switch (input.type) {
    case 'shape': {
      const def = input.semantic ? registry?.get(input.semantic) : undefined;
      const size = input.size ?? def?.defaultSize ?? DEFAULT_NODE_SIZE;
      const shape: ShapeKind = input.shape ?? def?.shape ?? 'rectangle';
      const label =
        input.label ?? (def?.label ? { text: def.label } : undefined);
      const merged = def?.metadata
        ? { ...base, metadata: { ...def.metadata, ...base.metadata } }
        : base;
      return {
        ...merged,
        ...commonNodeFields({ ...input, size, label }, size),
        type: 'shape',
        shape,
        semantic: input.semantic,
        style: input.style ?? def?.defaultStyle,
      };
    }
    case 'text':
      return {
        ...base,
        ...commonNodeFields(input, DEFAULT_NODE_SIZE),
        type: 'text',
        text: input.text,
      };
    case 'image':
      return {
        ...base,
        ...commonNodeFields(input, DEFAULT_NODE_SIZE),
        type: 'image',
        src: input.src,
        alt: input.alt,
      };
    case 'icon':
      return {
        ...base,
        ...commonNodeFields(input, DEFAULT_NODE_SIZE),
        type: 'icon',
        icon: input.icon,
      };
    case 'container':
      return {
        ...base,
        ...commonNodeFields(input, DEFAULT_NODE_SIZE),
        type: 'container',
        childIds: input.childIds ?? [],
      };
  }
}

export interface NewEdge {
  readonly source: Endpoint;
  readonly target: Endpoint;
  readonly routing?: RoutingKind;
  readonly waypoints?: readonly Point[];
  readonly arrowheads?: Arrowheads;
  readonly label?: EdgeLabel;
  readonly style?: Style;
  readonly styleRef?: StyleId;
  readonly layerId?: LayerId;
  readonly tagIds?: readonly TagId[];
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

export function buildEdge(ctx: BuildContext, input: NewEdge): DiagramEdge {
  return {
    ...newEntityBase(ctx.ids.edge(), ctx.clock, input.metadata),
    source: input.source,
    target: input.target,
    routing: input.routing ?? 'straight',
    waypoints: input.waypoints,
    arrowheads: input.arrowheads ?? DEFAULT_ARROWHEADS,
    label: input.label,
    style: input.style,
    styleRef: input.styleRef,
    layerId: input.layerId,
    tagIds: input.tagIds,
    locked: input.locked,
  };
}

export interface NewGroup {
  readonly kind?: GroupKind;
  readonly name?: string;
  readonly childIds?: readonly GroupChildId[];
  readonly layerId?: LayerId;
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

export function buildGroup(ctx: BuildContext, input: NewGroup = {}): DiagramGroup {
  return {
    ...newEntityBase(ctx.ids.group(), ctx.clock, input.metadata),
    kind: input.kind ?? 'group',
    name: input.name,
    childIds: input.childIds ?? [],
    layerId: input.layerId,
    locked: input.locked,
  };
}

export interface NewLayer {
  readonly name: string;
  readonly order?: number;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

export function buildLayer(ctx: BuildContext, input: NewLayer): Layer {
  return {
    ...newEntityBase(ctx.ids.layer(), ctx.clock, input.metadata),
    name: input.name,
    order: input.order ?? 0,
    visible: input.visible ?? true,
    locked: input.locked ?? false,
  };
}

export interface NewTag {
  readonly label: string;
  readonly color?: string;
  readonly metadata?: Metadata;
}

export function buildTag(ctx: BuildContext, input: NewTag): DiagramTag {
  return {
    ...newEntityBase(ctx.ids.tag(), ctx.clock, input.metadata),
    label: input.label,
    color: input.color,
  };
}

export interface NewStyle {
  readonly name: string;
  readonly style: Style;
}

export function buildNamedStyle(ctx: BuildContext, input: NewStyle): NamedStyle {
  return { id: ctx.ids.style(), name: input.name, style: input.style };
}

export interface NewAnnotation {
  readonly target: AnnotationTarget;
  readonly text: string;
  readonly metadata?: Metadata;
}

export function buildAnnotation(ctx: BuildContext, input: NewAnnotation): Annotation {
  return {
    ...newEntityBase(ctx.ids.annotation(), ctx.clock, input.metadata),
    target: input.target,
    text: input.text,
  };
}

export interface NewComment {
  readonly target: AnnotationTarget;
  readonly author: string;
  readonly body: string;
  readonly resolved?: boolean;
  readonly metadata?: Metadata;
}

export function buildComment(ctx: BuildContext, input: NewComment): DiagramComment {
  return {
    ...newEntityBase(ctx.ids.comment(), ctx.clock, input.metadata),
    target: input.target,
    author: input.author,
    body: input.body,
    resolved: input.resolved ?? false,
    replies: [],
  };
}
