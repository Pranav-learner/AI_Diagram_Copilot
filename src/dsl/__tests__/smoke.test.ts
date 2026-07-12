import { describe, it, expect } from 'vitest';
import { makeModel } from './helpers';
import { CURRENT_SCHEMA_VERSION } from '../migration/versions';

describe('smoke', () => {
  it('creates an empty, valid document', () => {
    const model = makeModel();
    expect(model.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(model.validate().valid).toBe(true);
    expect(Object.keys(model.document.nodes)).toHaveLength(0);
  });
});
