/**
 * The engine's event vocabulary.
 *
 * The rendering engine emits granular, typed events as documents render and sync.
 * Future modules subscribe without any coupling to the engine internals: an AI
 * module watches `node:created`; a presence layer watches `selection:changed`; a
 * telemetry layer watches `error`. Events are the extension seam for observers.
 */

import type { DiagramNode, DiagramEdge, Viewport } from '@/dsl';

/** Canonical event names. */
export const EngineEventName = {
  RendererReady: 'renderer:ready',
  SceneChanged: 'scene:changed',
  NodeCreated: 'node:created',
  NodeUpdated: 'node:updated',
  NodeDeleted: 'node:deleted',
  EdgeCreated: 'edge:created',
  EdgeUpdated: 'edge:updated',
  EdgeDeleted: 'edge:deleted',
  SelectionChanged: 'selection:changed',
  ViewportChanged: 'viewport:changed',
  Error: 'error',
} as const;

export type EngineEventName = (typeof EngineEventName)[keyof typeof EngineEventName];

/** Payload delivered for each event name. */
export interface EngineEventMap {
  'renderer:ready': { readonly rendererId: string };
  'scene:changed': { readonly rendererId: string; readonly changedCount: number };
  'node:created': { readonly node: DiagramNode };
  'node:updated': { readonly node: DiagramNode };
  'node:deleted': { readonly nodeId: string };
  'edge:created': { readonly edge: DiagramEdge };
  'edge:updated': { readonly edge: DiagramEdge };
  'edge:deleted': { readonly edgeId: string };
  'selection:changed': { readonly ids: readonly string[] };
  'viewport:changed': { readonly viewport: Viewport };
  'error': { readonly error: Error };
}
