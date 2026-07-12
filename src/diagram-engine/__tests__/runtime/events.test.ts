import { describe, it, expect } from 'vitest';
import { createNode, deleteNode, RuntimeEventName } from '../..';
import { makeRuntime, nid } from './helpers';

describe('runtime events', () => {
  it('emits the operation lifecycle in order for a successful execute', () => {
    const runtime = makeRuntime();
    const seq: string[] = [];
    for (const name of [
      RuntimeEventName.TransactionStarted,
      RuntimeEventName.OperationStarted,
      RuntimeEventName.OperationCompleted,
      'commit' as const,
      RuntimeEventName.HistoryChanged,
      RuntimeEventName.TransactionCommitted,
    ]) {
      runtime.events.on(name, () => seq.push(name));
    }

    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));

    const idx = (n: string) => seq.indexOf(n);
    expect(idx('transaction:started')).toBeGreaterThanOrEqual(0);
    expect(idx('operation:started')).toBeGreaterThan(idx('transaction:started'));
    expect(idx('operation:completed')).toBeGreaterThan(idx('operation:started'));
    expect(idx('commit')).toBeGreaterThan(idx('operation:completed'));
    expect(idx('history:changed')).toBeGreaterThan(idx('commit'));
    expect(idx('transaction:committed')).toBeGreaterThan(idx('history:changed'));
  });

  it('emits diagram:changed with the origin', () => {
    const runtime = makeRuntime();
    let origin: string | undefined;
    runtime.events.on('diagram:changed', (e) => (origin = e.origin));
    runtime.execute(createNode({ type: 'shape', shape: 'rectangle' }, { id: nid('n1') }));
    expect(origin).toBe('program');
  });

  it('emits operation:failed (and no commit) on a rejected operation', () => {
    const runtime = makeRuntime();
    const seen: string[] = [];
    runtime.events.on('operation:failed', () => seen.push('failed'));
    runtime.events.on('commit', () => seen.push('commit'));
    expect(() => runtime.execute(deleteNode(nid('ghost')))).toThrow();
    expect(seen).toEqual(['failed']);
  });
});
