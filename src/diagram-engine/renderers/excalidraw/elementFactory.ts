/**
 * Builders for Excalidraw elements.
 *
 * `makeBaseElement` fills every required base field with Excalidraw's own
 * defaults so mappers only specify what differs, and seeds `seed`/`versionNonce`
 * deterministically from the id (see {@link hash}). `bumpElementVersion` is the
 * one place reconciliation versions advance — used by the synchronizer to mark
 * exactly the elements Excalidraw should re-render.
 */

import { ELEMENT_DEFAULTS } from './constants';
import { seedFrom, nonceFrom } from './hash';
import type {
  ExElementBase,
  ExElementType,
  ExFillStyle,
  ExStrokeStyle,
  ExRoundness,
  ExBoundElement,
} from './types';

export interface BaseElementInput {
  readonly id: string;
  readonly type: ExElementType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle?: number;
  readonly strokeColor?: string;
  readonly backgroundColor?: string;
  readonly fillStyle?: ExFillStyle;
  readonly strokeWidth?: number;
  readonly strokeStyle?: ExStrokeStyle;
  readonly roughness?: number;
  readonly opacity?: number;
  readonly roundness?: ExRoundness;
  readonly groupIds?: readonly string[];
  readonly frameId?: string | null;
  readonly boundElements?: readonly ExBoundElement[] | null;
  readonly link?: string | null;
  readonly locked?: boolean;
  readonly customData?: Record<string, unknown>;
  readonly version?: number;
  readonly versionNonce?: number;
}

export function makeBaseElement(input: BaseElementInput, epoch: number): ExElementBase {
  return {
    id: input.id,
    type: input.type,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    angle: input.angle ?? 0,
    strokeColor: input.strokeColor ?? ELEMENT_DEFAULTS.strokeColor,
    backgroundColor: input.backgroundColor ?? ELEMENT_DEFAULTS.backgroundColor,
    fillStyle: input.fillStyle ?? ELEMENT_DEFAULTS.fillStyle,
    strokeWidth: input.strokeWidth ?? ELEMENT_DEFAULTS.strokeWidth,
    strokeStyle: input.strokeStyle ?? ELEMENT_DEFAULTS.strokeStyle,
    roughness: input.roughness ?? ELEMENT_DEFAULTS.roughness,
    opacity: input.opacity ?? ELEMENT_DEFAULTS.opacity,
    roundness: input.roundness ?? null,
    seed: seedFrom(input.id),
    version: input.version ?? 1,
    versionNonce: input.versionNonce ?? nonceFrom(input.id),
    updated: epoch,
    isDeleted: false,
    groupIds: input.groupIds ?? [],
    frameId: input.frameId ?? null,
    boundElements: input.boundElements ?? null,
    link: input.link ?? null,
    locked: input.locked ?? false,
    customData: input.customData,
  };
}

/** Advance an element's reconciliation version (deterministic nonce). */
export function bumpElementVersion<T extends ExElementBase>(element: T): T {
  const nextVersion = element.version + 1;
  return { ...element, version: nextVersion, versionNonce: nonceFrom(element.id, nextVersion) };
}
