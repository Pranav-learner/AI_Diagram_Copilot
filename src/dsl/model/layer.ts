/**
 * The layer model.
 *
 * Layers are orthogonal to groups: a group aggregates entities structurally,
 * while a layer controls stacking/visibility across the whole diagram (think
 * Photoshop layers). Any node/edge/group may reference a `layerId`. Kept minimal
 * and forward-looking — the render pipeline (a later module) consumes `order`,
 * `visible`, and `locked`.
 */

import type { EntityBase } from '../core/entity';
import type { LayerId } from '../primitives/ids';

export interface Layer extends EntityBase<LayerId> {
  readonly name: string;
  /** Draw order across layers — higher is on top. */
  readonly order: number;
  readonly visible: boolean;
  readonly locked: boolean;
}
