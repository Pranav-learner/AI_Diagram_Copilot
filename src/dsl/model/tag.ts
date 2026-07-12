/**
 * Tags — reusable labels entities can reference by id.
 *
 * A tag is defined once at the document level; nodes and edges reference it via
 * `tagIds`. This keeps tag text/color in one place (rename once, everywhere
 * updates) and lets future modules filter/group by tag. Prefixed `Diagram` for
 * symmetry with the other domain entities.
 */

import type { EntityBase } from '../core/entity';
import type { TagId } from '../primitives/ids';
import type { Color } from '../primitives/scalars';

export interface DiagramTag extends EntityBase<TagId> {
  readonly label: string;
  readonly color?: Color;
}
