/**
 * The two loss-aware escrow channels.
 *
 * Round-trips are lossless because each direction stashes what the other format
 * can't represent:
 *  - **Element escrow** (`element.customData.adc`) — the authoritative DSL entity
 *    behind an element, so DSL-only concepts (semantic, z, tags, layer, metadata,
 *    revision, routing…) survive `DSL → scene → DSL`.
 *  - **Document escrow** (`appState.customData.adc`) — the document-level DSL
 *    entities that aren't rendered as elements (groups, layers, styles, tags,
 *    annotations, comments, doc metadata, canvas size), so the whole document
 *    round-trips at the library boundary.
 *  - **Excalidraw metadata** (`node.metadata.__excalidraw`) — the reverse channel,
 *    written only when parsing a *manually-created* element, preserving
 *    Excalidraw-only fields (seed, roughness…) for `scene → DSL → scene`.
 *
 * If the document escrow is ever lost (a real Excalidraw session normalizes
 * appState), parse degrades gracefully: nodes/edges still carry their own element
 * escrow, and group membership is recoverable from `groupIds`.
 */

import type {
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  Layer,
  DiagramTag,
  Annotation,
  DiagramComment,
  NamedStyle,
  Metadata,
  Size,
} from '@/dsl';
import { CUSTOM_DATA_KEY } from './constants';
import type { ExElementBase, ExAppState } from './types';

export interface NodeEscrow {
  readonly v: 1;
  readonly kind: 'node';
  readonly entity: DiagramNode;
}
export interface EdgeEscrow {
  readonly v: 1;
  readonly kind: 'edge';
  readonly entity: DiagramEdge;
}
export interface LabelEscrow {
  readonly v: 1;
  readonly kind: 'label';
  readonly ownerId: string;
}
export type ElementEscrow = NodeEscrow | EdgeEscrow | LabelEscrow;

export interface DocumentEscrow {
  readonly v: 1;
  readonly documentId: string;
  readonly name?: string;
  readonly schemaVersion: string;
  readonly metadata: Metadata;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly canvasSize: Size;
  readonly styles: Readonly<Record<string, NamedStyle>>;
  readonly groups: Readonly<Record<string, DiagramGroup>>;
  readonly layers: Readonly<Record<string, Layer>>;
  readonly tags: Readonly<Record<string, DiagramTag>>;
  readonly annotations: Readonly<Record<string, Annotation>>;
  readonly comments: Readonly<Record<string, DiagramComment>>;
}

/** Wrap an escrow payload for storage under an element's/appState's custom-data key. */
export function wrapCustomData(payload: ElementEscrow): Record<string, unknown> {
  return { [CUSTOM_DATA_KEY]: payload };
}

function readCustom(container: { customData?: Record<string, unknown> }): unknown {
  return container.customData?.[CUSTOM_DATA_KEY];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readElementEscrow(element: ExElementBase): ElementEscrow | undefined {
  const raw = readCustom(element);
  if (!isRecord(raw)) return undefined;
  if (raw['kind'] === 'node' || raw['kind'] === 'edge' || raw['kind'] === 'label') {
    return raw as unknown as ElementEscrow;
  }
  return undefined;
}

export function readDocumentEscrow(appState: ExAppState): DocumentEscrow | undefined {
  const raw = appState[CUSTOM_DATA_KEY];
  if (!isRecord(raw) || raw['v'] !== 1 || typeof raw['documentId'] !== 'string') {
    return undefined;
  }
  return raw as unknown as DocumentEscrow;
}
