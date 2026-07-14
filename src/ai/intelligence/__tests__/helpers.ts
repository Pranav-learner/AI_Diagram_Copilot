/**
 * Test fixtures for the Diagram Intelligence Engine. Deterministic diagrams and
 * clock; the real Understanding Engine as the graph source (so `update()` drives
 * proactive refreshes); an AIService backed by the heuristic insight mock.
 */

import { DiagramModel, createSequentialIdFactory, fixedClock } from '@/dsl';
import type { DiagramModel as Model } from '@/dsl';
import { AIService, ProviderRegistry, MockProvider, mergeConfig, UnderstandingEngine } from '@/ai';
import type { AIProvider, Finding, Severity, ReviewCategory } from '@/ai';
import { MockInsightProvider } from '../MockInsightProvider';

export function makeModel(name = 'doc-intel'): DiagramModel {
  return DiagramModel.create({ id: name as never, ids: createSequentialIdFactory(), clock: fixedClock('2026-07-14T00:00:00.000Z') });
}

const shape = (m: Model, semantic: string, text: string) => m.createNode({ type: 'shape', semantic: semantic as never, label: { text } });
const connect = (m: Model, a: string, b: string, relType = 'dependency') => m.createEdge({ source: { nodeId: a as never }, target: { nodeId: b as never }, metadata: { relType } });

/** A flawed software architecture (SPOF DB, no gateway/auth/cache/observability). */
export function softwareModel() {
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
  return { model: m, ids: { user: user.id, orders: orders.id, billing: billing.id, catalog: catalog.id, db: db.id }, addAuth: () => connect(m, user.id, shape(m, 'service', 'Auth Service').id, 'flow') };
}

export function engineFor(model: DiagramModel): UnderstandingEngine {
  return UnderstandingEngine.fromDocument(model.document, 1);
}

/** A monotonic clock for deterministic timestamps/ordering. */
export function counterClock(): () => number {
  let t = 0;
  return () => ++t;
}

export function insightService(provider: AIProvider = new MockInsightProvider()): AIService {
  return new AIService({ registry: new ProviderRegistry().register(provider), config: mergeConfig({ provider: provider.id }) });
}

export function scriptedService(...replies: string[]): AIService {
  return new AIService({ registry: new ProviderRegistry().register(new MockProvider({ id: 'scripted', replies })), config: mergeConfig({ provider: 'scripted' }) });
}

/** Build a minimal Finding for repository/aggregation/prioritization tests. */
export function finding(id: string, opts: Partial<Finding> = {}): Finding {
  return {
    id,
    ruleId: opts.ruleId ?? id.split('#')[0]!,
    category: (opts.category ?? 'reliability') as ReviewCategory,
    severity: (opts.severity ?? 'high') as Severity,
    confidence: opts.confidence ?? 0.9,
    title: opts.title ?? `Finding ${id}`,
    message: opts.message ?? 'message',
    affectedEntities: opts.affectedEntities ?? [],
    evidence: opts.evidence ?? ['evidence'],
    recommendation: opts.recommendation ?? 'do the thing',
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };
}
