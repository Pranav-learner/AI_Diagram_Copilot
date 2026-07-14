import { describe, it, expect } from 'vitest';
import { IntelligenceEngine } from '../IntelligenceEngine';
import { engineFor, insightService, counterClock, makeModel } from './helpers';

describe('IntelligenceEngine — large diagrams', () => {
  it('builds a ranked feed for a 500-node diagram quickly', () => {
    const m = makeModel();
    const hub = m.createNode({ type: 'shape', semantic: 'gateway', label: { text: 'Gateway' } });
    for (let i = 0; i < 500; i++) {
      const n = m.createNode({ type: 'shape', semantic: i % 4 === 0 ? 'database' : 'service', label: { text: `N${i}` } });
      m.createEdge({ source: { nodeId: hub.id }, target: { nodeId: n.id }, metadata: { relType: 'dependency' } });
    }
    const t0 = performance.now();
    const engine = new IntelligenceEngine({ graphSource: engineFor(m), service: insightService(), now: counterClock() });
    const ms = performance.now() - t0;

    const feed = engine.getFeed();
    expect(feed.length).toBeGreaterThan(0);
    // Findings of the same rule are merged, so the feed stays small even at scale.
    expect(feed.length).toBeLessThan(30);
    expect(ms).toBeLessThan(3000);
    expect(engine.metrics().lastAnalysisMs).toBeGreaterThanOrEqual(0);
  });
});
