import type { AppState, NormalizedZoomValue } from '@excalidraw/excalidraw/types';
import { ZOOM } from '../CanvasEngine';

/** Clamp to Excalidraw's supported zoom range and tidy float drift. */
export function clampZoom(value: number): NormalizedZoomValue {
  const clamped = Math.min(ZOOM.MAX, Math.max(ZOOM.MIN, value));
  return (Math.round(clamped * 100) / 100) as NormalizedZoomValue;
}

/** Scroll/zoom appState fields for updateScene. */
export interface ZoomViewport {
  scrollX: number;
  scrollY: number;
  zoom: { value: NormalizedZoomValue };
}

/**
 * Compute the scroll + zoom needed to change zoom to `nextZoom` while keeping
 * the viewport center fixed. This mirrors Excalidraw's internal `getStateForZoom`
 * so our toolbar zoom feels identical to its native controls.
 */
export function zoomToViewportCenter(
  appState: Pick<
    AppState,
    'width' | 'height' | 'offsetLeft' | 'offsetTop' | 'scrollX' | 'scrollY' | 'zoom'
  >,
  nextZoomValue: number,
): ZoomViewport {
  const nextZoom = clampZoom(nextZoomValue);
  const currentZoom = appState.zoom.value;

  // Anchor at the viewport center, expressed in the app layer's coordinate space.
  const appLayerX = appState.width / 2;
  const appLayerY = appState.height / 2;

  const baseScrollX = appState.scrollX + (appLayerX - appLayerX / currentZoom);
  const baseScrollY = appState.scrollY + (appLayerY - appLayerY / currentZoom);
  const zoomOffsetScrollX = -(appLayerX - appLayerX / nextZoom);
  const zoomOffsetScrollY = -(appLayerY - appLayerY / nextZoom);

  return {
    scrollX: baseScrollX + zoomOffsetScrollX,
    scrollY: baseScrollY + zoomOffsetScrollY,
    zoom: { value: nextZoom },
  };
}
