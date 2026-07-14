/**
 * Test fixtures for the Understanding Engine. Deterministic ids + frozen clock so
 * graphs are reproducible. `makeArchitecture()` builds a small but representative
 * service diagram (actors, gateway, services, data stores, a group, tags,
 * typed relationships) exercised across the suite.
 */

import { DiagramModel } from '@/dsl';
import { createSequentialIdFactory, fixedClock } from '@/dsl';
import type { DocumentId, NodeId, GroupId, TagId } from '@/dsl';

export function makeModel(): DiagramModel {
  return DiagramModel.create({
    id: 'doc-test' as DocumentId,
    ids: createSequentialIdFactory(),
    clock: fixedClock('2026-07-14T00:00:00.000Z'),
  });
}

export interface ArchIds {
  user: NodeId;
  gateway: NodeId;
  svcA: NodeId;
  svcB: NodeId;
  db: NodeId;
  cache: NodeId;
  backend: GroupId;
  publicTag: TagId;
}

/**
 * user → gateway → {svcA, svcB}; svcA → {db, cache}; svcB → db.
 * svcA/svcB/db/cache live in the "Backend" group. svcA is tagged "public".
 * All service edges carry a `dependency` relType.
 */
export function makeArchitecture(): { model: DiagramModel; ids: ArchIds } {
  const model = makeModel();
  const publicTag = model.createTag({ label: 'public' });

  const user = model.createNode({ type: 'shape', semantic: 'user', label: { text: 'Customer' }, position: { x: 0, y: 0 }, size: { width: 80, height: 40 } });
  const gateway = model.createNode({ type: 'shape', semantic: 'gateway', label: { text: 'API Gateway' }, position: { x: 200, y: 0 }, size: { width: 160, height: 80 } });
  const svcA = model.createNode({ type: 'shape', semantic: 'service', label: { text: 'Orders Service' }, position: { x: 400, y: -80 }, size: { width: 120, height: 64 }, tagIds: [publicTag.id] });
  const svcB = model.createNode({ type: 'shape', semantic: 'service', label: { text: 'Billing Service' }, position: { x: 400, y: 80 }, size: { width: 120, height: 64 } });
  const db = model.createNode({ type: 'shape', semantic: 'database', label: { text: 'Postgres' }, position: { x: 640, y: 0 }, size: { width: 100, height: 100 } });
  const cache = model.createNode({ type: 'shape', semantic: 'cache', label: { text: 'Redis' }, position: { x: 640, y: -140 }, size: { width: 90, height: 60 } });

  const dep = { metadata: { relType: 'dependency' } } as const;
  model.createEdge({ source: { nodeId: user.id }, target: { nodeId: gateway.id }, metadata: { relType: 'flow' } });
  model.createEdge({ source: { nodeId: gateway.id }, target: { nodeId: svcA.id }, ...dep });
  model.createEdge({ source: { nodeId: gateway.id }, target: { nodeId: svcB.id }, ...dep });
  model.createEdge({ source: { nodeId: svcA.id }, target: { nodeId: db.id }, ...dep });
  model.createEdge({ source: { nodeId: svcA.id }, target: { nodeId: cache.id }, ...dep });
  model.createEdge({ source: { nodeId: svcB.id }, target: { nodeId: db.id }, ...dep });

  const backend = model.createGroup({ name: 'Backend', childIds: [svcA.id, svcB.id, db.id, cache.id] });

  return {
    model,
    ids: {
      user: user.id,
      gateway: gateway.id,
      svcA: svcA.id,
      svcB: svcB.id,
      db: db.id,
      cache: cache.id,
      backend: backend.id,
      publicTag: publicTag.id,
    },
  };
}
