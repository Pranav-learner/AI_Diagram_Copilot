import { describe, it, expect } from 'vitest';
import { FindingRepository } from '../FindingRepository';
import { finding, counterClock } from './helpers';

describe('FindingRepository', () => {
  it('adds new findings and reports them once', () => {
    const repo = new FindingRepository(counterClock());
    const diff = repo.update([finding('a'), finding('b')], 1);
    expect(diff.added).toHaveLength(2);
    expect(repo.stats().active).toBe(2);
  });

  it('suppresses duplicates on re-analysis (no new events)', () => {
    const repo = new FindingRepository(counterClock());
    repo.update([finding('a'), finding('b')], 1);
    const diff = repo.update([finding('a'), finding('b')], 2);
    expect(diff.added).toHaveLength(0);
    expect(diff.suppressedDuplicates).toBe(2);
    expect(repo.get('a')!.seenCount).toBe(2);
  });

  it('resolves findings that disappear', () => {
    const repo = new FindingRepository(counterClock());
    repo.update([finding('a'), finding('b')], 1);
    const diff = repo.update([finding('a')], 2);
    expect(diff.resolved.map((f) => f.id)).toEqual(['b']);
    expect(repo.get('b')!.status).toBe('resolved');
    expect(repo.stats().active).toBe(1);
  });

  it('marks a returning finding as recurring', () => {
    const repo = new FindingRepository(counterClock());
    repo.update([finding('a')], 1);
    repo.update([], 2); // a resolved
    const diff = repo.update([finding('a')], 3); // a is back
    expect(diff.recurring.map((f) => f.id)).toEqual(['a']);
    expect(repo.get('a')!.reappearances).toBe(1);
    expect(repo.get('a')!.status).toBe('active');
  });

  it('keeps dismissed findings suppressed even when they recur', () => {
    const repo = new FindingRepository(counterClock());
    repo.update([finding('a')], 1);
    repo.dismiss(['a']);
    const diff = repo.update([finding('a')], 2);
    expect(diff.recurring).toHaveLength(0);
    expect(diff.suppressedDuplicates).toBe(1);
    expect(repo.get('a')!.status).toBe('dismissed');
    expect(repo.active()).toHaveLength(0);
  });

  it('resurfaces a user-resolved finding if it is still detected', () => {
    const repo = new FindingRepository(counterClock());
    repo.update([finding('a')], 1);
    repo.markResolved(['a']);
    expect(repo.active()).toHaveLength(0);
    const diff = repo.update([finding('a')], 2); // still there → recurring
    expect(diff.recurring.map((f) => f.id)).toEqual(['a']);
  });
});
