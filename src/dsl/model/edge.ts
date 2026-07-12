/**
 * The edge model — a directed connection between two node endpoints.
 *
 * Endpoints bind to a node and, optionally, a named port or a cardinal anchor,
 * so routing can stay stable as nodes move. Routing style, waypoints, and
 * arrowheads are all data — a renderer interprets them, the DSL just stores
 * intent. "Animated" is deliberately *not* a routing kind (it is a rendering
 * concern); express it via style/metadata when a later module needs it.
 */

import type { EntityBase } from '../core/entity';
import type { EdgeId, NodeId, PortId, LayerId, StyleId, TagId } from '../primitives/ids';
import type { Point } from '../primitives/geometry';
import type { Style } from './style';

export type RoutingKind = 'straight' | 'curved' | 'orthogonal';

export type ArrowheadType =
  | 'none'
  | 'arrow'
  | 'triangle'
  | 'diamond'
  | 'circle'
  | 'bar';

/** Cardinal attachment point on a node when no explicit port is named. */
export type PortAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

/** One end of an edge. `nodeId` is required; the rest refine the attachment. */
export interface Endpoint {
  readonly nodeId: NodeId;
  readonly port?: PortId;
  readonly anchor?: PortAnchor;
  /** Optional fixed offset used by some routers/renderers. */
  readonly position?: Point;
}

export interface Arrowheads {
  readonly start: ArrowheadType;
  readonly end: ArrowheadType;
}

/** A label rendered along an edge. `position` is a 0..1 ratio along the path. */
export interface EdgeLabel {
  readonly text: string;
  readonly position?: number;
  readonly style?: Style;
}

export interface DiagramEdge extends EntityBase<EdgeId> {
  readonly source: Endpoint;
  readonly target: Endpoint;
  readonly routing: RoutingKind;
  /** Explicit intermediate points for manual/orthogonal routing. */
  readonly waypoints?: readonly Point[];
  readonly arrowheads: Arrowheads;
  readonly label?: EdgeLabel;
  readonly style?: Style;
  readonly styleRef?: StyleId;
  readonly layerId?: LayerId;
  readonly tagIds?: readonly TagId[];
  readonly locked?: boolean;
}

/** Default: a plain directed edge with an arrow at the target. */
export const DEFAULT_ARROWHEADS: Arrowheads = { start: 'none', end: 'arrow' };
