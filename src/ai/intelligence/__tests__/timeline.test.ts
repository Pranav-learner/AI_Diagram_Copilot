import { describe, it, expect } from 'vitest';
import { IntelligenceTimeline } from '../IntelligenceTimeline';
import { finding, counterClock } from './helpers';

describe('IntelligenceTimeline', () => {
  it('records discovered/resolved/recurring events from a diff', () => {
    const tl = new IntelligenceTimeline(counterClock());
    tl.recordDiff({ added: [finding('a')], resolved: [finding('b')], recurring: [finding('c')], unchanged: 0, suppressedDuplicates: 0 }, 1);
    expect(tl.byKind('discovered')).toHaveLength(1);
    expect(tl.byKind('resolved')).toHaveLength(1);
    expect(tl.byKind('recurring')).toHaveLength(1);
  });

  it('records user actions and returns most-recent-first', () => {
    const tl = new IntelligenceTimeline(counterClock());
    tl.record('dismissed', { version: 1, title: 'X', insightId: 'insight:x' });
    tl.record('accepted', { version: 2, title: 'Y', insightId: 'insight:y' });
    const recent = tl.recent();
    expect(recent[0]!.kind).toBe('accepted');
    expect(recent[1]!.kind).toBe('dismissed');
  });

  it('bounds the buffer', () => {
    const tl = new IntelligenceTimeline(counterClock(), 5);
    for (let i = 0; i < 20; i++) tl.record('discovered', { version: i, title: `t${i}` });
    expect(tl.all()).toHaveLength(5);
  });
});
