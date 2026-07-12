import { describe, it, expect } from 'vitest';
import { DiagramRuntime, OriginTracker, TransactionManager, VersionManager } from '../..';
import { makeModel } from '../helpers';

describe('DiagramRuntime', () => {
  it('commits a genuine change, bumping version and emitting', () => {
    const model = makeModel();
    model.createNode({ type: 'shape', shape: 'rectangle' });
    const runtime = new DiagramRuntime(model.document, { origin: 'load' });

    let events = 0;
    runtime.events.on('diagram:changed', () => (events += 1));

    const model2 = makeModel();
    model2.createNode({ type: 'shape', shape: 'ellipse' });
    const committed = runtime.commit(model2.document, 'program');

    expect(committed).toBe(true);
    expect(runtime.getVersion()).toBe(2);
    expect(runtime.getState().origin).toBe('program');
    expect(events).toBe(1);
  });

  it('is idempotent: committing an equal document is a no-op', () => {
    const model = makeModel();
    model.createNode({ type: 'shape', shape: 'rectangle' });
    const runtime = new DiagramRuntime(model.document, { origin: 'load' });
    let events = 0;
    runtime.events.on('commit', () => (events += 1));

    // A structurally-equal (but different-reference) document.
    const committed = runtime.commit({ ...model.document }, 'canvas');
    expect(committed).toBe(false);
    expect(runtime.getVersion()).toBe(1);
    expect(events).toBe(0);
  });
});

describe('guards', () => {
  it('TransactionManager: monotonic ids and a re-entrant lock', () => {
    const tm = new TransactionManager();
    expect(tm.begin('canvas').id).toBe(1);
    expect(tm.begin('program').id).toBe(2);

    expect(tm.isApplying).toBe(false);
    const release = tm.lock();
    expect(tm.isApplying).toBe(true);
    const release2 = tm.lock();
    release();
    expect(tm.isApplying).toBe(true); // still held by the second lock
    release2();
    expect(tm.isApplying).toBe(false);
    release(); // idempotent
    expect(tm.isApplying).toBe(false);
  });

  it('VersionManager: recognizes an echo by signature', () => {
    const vm = new VersionManager();
    expect(vm.isEcho('sig')).toBe(false);
    vm.markApplied('sig');
    expect(vm.isEcho('sig')).toBe(true);
    expect(vm.isEcho('other')).toBe(false);
    expect(vm.bump()).toBe(1);
    expect(vm.bump()).toBe(2);
  });

  it('OriginTracker: nested origins compose', () => {
    const ot = new OriginTracker();
    expect(ot.current).toBeUndefined();
    ot.run('program', () => {
      expect(ot.is('program')).toBe(true);
      ot.run('canvas', () => expect(ot.current).toBe('canvas'));
      expect(ot.current).toBe('program');
    });
    expect(ot.current).toBeUndefined();
  });
});
