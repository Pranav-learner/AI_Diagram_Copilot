/**
 * Deterministic test helpers: a DSL model with sequential ids + a frozen clock,
 * and an engine with a fixed epoch — so rendered scenes are byte-stable.
 */

import { DiagramModel, createSequentialIdFactory, fixedClock } from '@/dsl';
import { createExcalidrawEngine } from '..';
import type { ExcalidrawScene, ExElement } from '..';

export const FIXED_TIME = '2026-07-12T10:00:00.000Z';

export function makeModel(): DiagramModel {
  return DiagramModel.create({ ids: createSequentialIdFactory(), clock: fixedClock(FIXED_TIME) });
}

export function makeEngine() {
  return createExcalidrawEngine({ config: { epoch: 1 }, clock: fixedClock(FIXED_TIME) });
}

export function elementById(scene: ExcalidrawScene, id: string): ExElement | undefined {
  return scene.elements.find((element) => element.id === id);
}
