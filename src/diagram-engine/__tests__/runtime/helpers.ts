/**
 * Deterministic runtime test helpers — a runtime over an empty document with
 * sequential ids + a frozen clock, so operations and history are reproducible.
 */

import {
  createEmptyDocument,
  createSequentialIdFactory,
  fixedClock,
  CURRENT_SCHEMA_VERSION,
} from '@/dsl';
import type { NodeId, EdgeId, GroupId } from '@/dsl';
import { DiagramRuntime } from '../..';

export const T = '2026-07-12T10:00:00.000Z';

export function makeRuntime(): DiagramRuntime {
  const ids = createSequentialIdFactory();
  const clock = fixedClock(T);
  const document = createEmptyDocument({
    id: ids.document(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    clock,
  });
  return new DiagramRuntime(document, { ids, clock, origin: 'load' });
}

export const nid = (s: string): NodeId => s as NodeId;
export const eid = (s: string): EdgeId => s as EdgeId;
export const gid = (s: string): GroupId => s as GroupId;

/** Count nodes in the runtime's current document. */
export function nodeCount(runtime: DiagramRuntime): number {
  return Object.keys(runtime.getDocument().nodes).length;
}
