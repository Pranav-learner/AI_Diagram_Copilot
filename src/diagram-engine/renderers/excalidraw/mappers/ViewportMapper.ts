/**
 * Viewport mapping — DSL {@link Viewport} ⇄ Excalidraw `appState`.
 *
 * Purely presentational and fully reversible. `canvasSize` has no Excalidraw
 * `appState` equivalent (Excalidraw sizes to its container), so it is escrowed
 * at the scene level by the renderer rather than lost here.
 */

import type { Viewport } from '@/dsl';
import { DEFAULT_VIEWPORT } from '@/dsl';
import type { ExAppState } from '../types';

/** DSL viewport → the Excalidraw appState fields that represent it. */
export function viewportToAppState(viewport: Viewport, gridSize: number): ExAppState {
  return {
    scrollX: viewport.pan.x,
    scrollY: viewport.pan.y,
    zoom: { value: viewport.zoom },
    viewBackgroundColor: viewport.background,
    gridModeEnabled: viewport.grid.enabled,
    gridSize: viewport.grid.enabled ? viewport.grid.size : gridSize,
  };
}

/** Excalidraw appState → DSL viewport (inverse). Missing fields fall back to defaults. */
export function appStateToViewport(appState: ExAppState): Viewport {
  const zoom = typeof appState.zoom?.value === 'number' ? appState.zoom.value : DEFAULT_VIEWPORT.zoom;
  const gridEnabled = appState.gridModeEnabled ?? DEFAULT_VIEWPORT.grid.enabled;
  const gridSize =
    typeof appState.gridSize === 'number' ? appState.gridSize : DEFAULT_VIEWPORT.grid.size;
  return {
    zoom,
    pan: {
      x: typeof appState.scrollX === 'number' ? appState.scrollX : DEFAULT_VIEWPORT.pan.x,
      y: typeof appState.scrollY === 'number' ? appState.scrollY : DEFAULT_VIEWPORT.pan.y,
    },
    canvasSize: DEFAULT_VIEWPORT.canvasSize,
    background:
      typeof appState.viewBackgroundColor === 'string'
        ? appState.viewBackgroundColor
        : DEFAULT_VIEWPORT.background,
    grid: {
      enabled: gridEnabled,
      size: gridSize,
      snap: DEFAULT_VIEWPORT.grid.snap,
    },
  };
}
