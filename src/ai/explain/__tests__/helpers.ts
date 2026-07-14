/**
 * Test fixtures for Explain Mode. Deterministic diagrams (sequential ids, frozen
 * clock) fed through the real Understanding Engine, plus an AIService backed by
 * the heuristic explain mock (or a scripted provider for exact-output tests).
 */

import { DiagramModel, createSequentialIdFactory, fixedClock } from '@/dsl';
import type { DiagramDocument } from '@/dsl';
import { AIService, ProviderRegistry, MockProvider, mergeConfig, UnderstandingEngine } from '@/ai';
import type { AIProvider } from '@/ai';
import { MockExplainProvider } from '../MockExplainProvider';

export function makeModel(name = 'doc-explain'): DiagramModel {
  return DiagramModel.create({ id: name as never, ids: createSequentialIdFactory(), clock: fixedClock('2026-07-14T00:00:00.000Z') });
}

export interface ArchIds {
  user: string;
  gateway: string;
  svcA: string;
  svcB: string;
  db: string;
  cache: string;
  backend: string;
}

/** user → gateway → {svcA,svcB}; svcA → {db,cache}; svcB → db. Backend group. */
export function architecture(): { model: DiagramModel; doc: DiagramDocument; ids: ArchIds } {
  const model = makeModel();
  const user = model.createNode({ type: 'shape', semantic: 'user', label: { text: 'Customer' } });
  const gateway = model.createNode({ type: 'shape', semantic: 'gateway', label: { text: 'API Gateway' }, size: { width: 160, height: 80 } });
  const svcA = model.createNode({ type: 'shape', semantic: 'service', label: { text: 'Orders Service' } });
  const svcB = model.createNode({ type: 'shape', semantic: 'service', label: { text: 'Billing Service' } });
  const db = model.createNode({ type: 'shape', semantic: 'database', label: { text: 'Postgres' } });
  const cache = model.createNode({ type: 'shape', semantic: 'cache', label: { text: 'Redis' } });
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
    doc: model.document,
    ids: { user: user.id, gateway: gateway.id, svcA: svcA.id, svcB: svcB.id, db: db.id, cache: cache.id, backend: backend.id },
  };
}

export function engineFor(doc: DiagramDocument): UnderstandingEngine {
  return UnderstandingEngine.fromDocument(doc, 1);
}

/** An AIService backed by the heuristic explain provider (context-aware). */
export function explainService(provider: AIProvider = new MockExplainProvider()): AIService {
  const registry = new ProviderRegistry().register(provider);
  return new AIService({ registry, config: mergeConfig({ provider: provider.id }) });
}

/** An AIService returning exact canned JSON strings in order. */
export function scriptedService(...replies: string[]): AIService {
  const registry = new ProviderRegistry().register(new MockProvider({ id: 'scripted', replies }));
  return new AIService({ registry, config: mergeConfig({ provider: 'scripted' }) });
}
