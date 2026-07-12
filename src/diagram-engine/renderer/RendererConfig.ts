/**
 * Engine configuration.
 *
 * All knobs are here with sensible defaults, so behaviour is explicit and
 * deterministic. `epoch` seeds the `updated` timestamp on rendered elements —
 * fixing it makes `render(doc)` a pure function (snapshot-testable).
 */

import type { Theme } from '@/dsl';

export interface EngineConfig {
  /** Validate the DSL document before rendering; invalid → RenderError. */
  readonly validate: boolean;
  /** Throw on a per-entity mapping failure instead of downgrading to a warning. */
  readonly strict: boolean;
  /** The `updated` epoch stamped on rendered elements (determinism). */
  readonly epoch: number;
  /** Default grid spacing when the DSL viewport enables the grid. */
  readonly gridSize: number;
  /** Optional theme supplying per-kind default styles (lowest precedence). */
  readonly theme?: Theme;
}

export const DEFAULT_CONFIG: EngineConfig = {
  validate: true,
  strict: false,
  epoch: 1,
  gridSize: 20,
};

export function resolveConfig(partial?: Partial<EngineConfig>): EngineConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}
