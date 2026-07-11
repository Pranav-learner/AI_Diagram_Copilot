import { createContext } from 'react';
import type { ExcalidrawAdapter } from '../adapters/ExcalidrawAdapter';

/**
 * Holds the live engine instance. Typed as the concrete adapter so the internal
 * Canvas host can access host-wiring methods (`attach`, `handlePointerUpdate`);
 * public consumers receive it narrowed to the {@link CanvasEngine} interface via
 * the `useCanvas` hook and never see Excalidraw.
 */
export const CanvasContext = createContext<ExcalidrawAdapter | null>(null);
