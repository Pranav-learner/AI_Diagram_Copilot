/**
 * Shared test utilities. A deterministic model (sequential ids + frozen clock)
 * so serialized output and ids are stable and snapshot-friendly.
 */

import { DiagramModel } from '../api/DiagramModel';
import { createSequentialIdFactory } from '../primitives/ids';
import { fixedClock } from '../primitives/scalars';
import type { DiagramModelOptions } from '../api/DiagramModel';

export const FIXED_TIME = '2026-07-12T10:00:00.000Z';

/** Deterministic model options: sequential ids, frozen clock. */
export function deterministicOptions(): Required<Pick<DiagramModelOptions, 'ids' | 'clock'>> {
  return { ids: createSequentialIdFactory(), clock: fixedClock(FIXED_TIME) };
}

/** A fresh, deterministic, empty model. */
export function makeModel(): DiagramModel {
  return DiagramModel.create(deterministicOptions());
}

/** A model preloaded with two shape nodes joined by an edge. */
export function makeConnectedModel(): {
  model: DiagramModel;
  aId: import('../primitives/ids').NodeId;
  bId: import('../primitives/ids').NodeId;
  edgeId: import('../primitives/ids').EdgeId;
} {
  const model = makeModel();
  const a = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'A' } });
  const b = model.createNode({ type: 'shape', semantic: 'database' });
  const edge = model.createEdge({
    source: { nodeId: a.id },
    target: { nodeId: b.id },
  });
  return { model, aId: a.id, bId: b.id, edgeId: edge.id };
}
