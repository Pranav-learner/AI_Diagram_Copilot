/**
 * Test fixtures for Diagram Review. Deterministic diagrams (sequential ids, frozen
 * clock) fed through the real Understanding Engine, plus an AIService backed by the
 * heuristic review mock (or a scripted provider for exact-output tests).
 */

import { DiagramModel, createSequentialIdFactory, fixedClock } from '@/dsl';
import type { DiagramDocument, DiagramModel as Model } from '@/dsl';
import { AIService, ProviderRegistry, MockProvider, mergeConfig, UnderstandingEngine } from '@/ai';
import type { AIProvider } from '@/ai';
import { MockReviewProvider } from '../MockReviewProvider';

export function makeModel(name = 'doc-review'): DiagramModel {
  return DiagramModel.create({ id: name as never, ids: createSequentialIdFactory(), clock: fixedClock('2026-07-14T00:00:00.000Z') });
}

const shape = (m: Model, semantic: string, text: string) => m.createNode({ type: 'shape', semantic: semantic as never, label: { text } });
const connect = (m: Model, a: string, b: string, relType = 'dependency') => m.createEdge({ source: { nodeId: a as never }, target: { nodeId: b as never }, metadata: { relType } });

/**
 * A flawed software architecture: clients hit services directly (no gateway),
 * everything shares one database (a single point of failure with no cache), and
 * there is no auth or observability.
 */
export function softwareDiagram() {
  const m = makeModel();
  const user = shape(m, 'user', 'Customer');
  const orders = shape(m, 'service', 'Orders Service');
  const billing = shape(m, 'service', 'Billing Service');
  const catalog = shape(m, 'service', 'Catalog Service');
  const db = shape(m, 'database', 'Postgres');
  connect(m, user.id, orders.id, 'flow');
  connect(m, user.id, billing.id, 'flow');
  connect(m, orders.id, db.id);
  connect(m, billing.id, db.id);
  connect(m, catalog.id, db.id);
  return { model: m, doc: m.document, ids: { user: user.id, orders: orders.id, billing: billing.id, catalog: catalog.id, db: db.id } };
}

/** A healthy architecture: gateway, auth, cache, monitoring, and a group. */
export function goodArchitecture() {
  const m = makeModel();
  const user = shape(m, 'user', 'Customer');
  const gateway = shape(m, 'gateway', 'API Gateway');
  const auth = shape(m, 'service', 'Auth Service');
  const orders = shape(m, 'service', 'Orders Service');
  const cache = shape(m, 'cache', 'Redis');
  const db = shape(m, 'database', 'Postgres');
  const mon = shape(m, 'service', 'Monitoring');
  connect(m, user.id, gateway.id, 'flow');
  connect(m, gateway.id, auth.id);
  connect(m, gateway.id, orders.id);
  connect(m, orders.id, cache.id);
  connect(m, orders.id, db.id);
  connect(m, orders.id, mon.id);
  m.createGroup({ name: 'Backend', childIds: [auth.id, orders.id, cache.id, db.id] as never });
  return { doc: m.document, ids: { user: user.id, gateway: gateway.id, auth: auth.id, orders: orders.id, cache: cache.id, db: db.id, mon: mon.id } };
}

/** A business workflow with a dead-end activity and no end node. */
export function workflowDiagram() {
  const m = makeModel();
  const start = shape(m, 'start', 'Start');
  const submit = shape(m, 'process', 'Submit Request');
  const decide = shape(m, 'decision', 'Approved?');
  const process = shape(m, 'process', 'Process Order');
  connect(m, start.id, submit.id, 'flow');
  connect(m, submit.id, decide.id, 'flow');
  connect(m, decide.id, process.id, 'flow');
  return { doc: m.document, ids: { start: start.id, submit: submit.id, decide: decide.id, process: process.id } };
}

/** A flat learning map (no depth). */
export function educationMap() {
  const m = makeModel();
  const root = m.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'Programming' } });
  const a = m.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'Variables' } });
  const b = m.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'Loops' } });
  const c = m.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'Functions' } });
  const d = m.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'OOP' } });
  connect(m, root.id, a.id, 'flow');
  connect(m, root.id, b.id, 'flow');
  connect(m, root.id, c.id, 'flow');
  connect(m, root.id, d.id, 'flow');
  return { doc: m.document, ids: { root: root.id, a: a.id, b: b.id, c: c.id, d: d.id } };
}

export function engineFor(doc: DiagramDocument): UnderstandingEngine {
  return UnderstandingEngine.fromDocument(doc, 1);
}

export function reviewService(provider: AIProvider = new MockReviewProvider()): AIService {
  return new AIService({ registry: new ProviderRegistry().register(provider), config: mergeConfig({ provider: provider.id }) });
}

export function scriptedService(...replies: string[]): AIService {
  return new AIService({ registry: new ProviderRegistry().register(new MockProvider({ id: 'scripted', replies })), config: mergeConfig({ provider: 'scripted' }) });
}
