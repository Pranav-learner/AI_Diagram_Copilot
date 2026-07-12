import { describe, it, expect } from 'vitest';
import { makeConnectedModel } from './helpers';
import { serialize, deserialize } from '../serialization/serialize';
import { applyMigrations, migrate, needsMigration } from '../migration/migrate';
import { CURRENT_SCHEMA_VERSION } from '../migration/versions';
import type { Migration, RawDocument } from '../migration/versions';
import { DiagramMigrationError, DiagramShapeError } from '../core/errors';

describe('migration', () => {
  it('is an identity for a current-version document', () => {
    const { model } = makeConnectedModel();
    const json = serialize(model.document);
    const restored = deserialize(json); // deserialize runs migrate internally
    expect(restored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(serialize(restored)).toBe(json);
  });

  it('applies a synthetic upgrade chain in order', () => {
    const raw: RawDocument = { schemaVersion: '0.8.0', payload: 'a' };
    const chain: Migration[] = [
      { from: '0.8.0', to: '0.9.0', up: (d) => ({ ...d, payload: `${String(d['payload'])}b` }) },
      { from: '0.9.0', to: '1.0.0', up: (d) => ({ ...d, payload: `${String(d['payload'])}c`, schemaVersion: '1.0.0' }) },
    ];
    const result = applyMigrations(raw, chain, '1.0.0');
    expect(result['payload']).toBe('abc');
    expect(result['schemaVersion']).toBe('1.0.0');
  });

  it('throws when no migration path exists', () => {
    const raw: RawDocument = { schemaVersion: '0.5.0' };
    expect(() => applyMigrations(raw, [], '1.0.0')).toThrow(DiagramMigrationError);
  });

  it('refuses to downgrade a newer-than-supported document', () => {
    const raw: RawDocument = { schemaVersion: '2.0.0' };
    expect(() => applyMigrations(raw, [], '1.0.0')).toThrow(DiagramMigrationError);
  });

  it('throws a shape error when schemaVersion is missing', () => {
    expect(() => migrate({ nodes: {} })).toThrow(DiagramShapeError);
  });

  it('computes needsMigration correctly', () => {
    expect(needsMigration('0.9.0', '1.0.0')).toBe(true);
    expect(needsMigration('1.0.0', '1.0.0')).toBe(false);
    expect(needsMigration('1.1.0', '1.0.0')).toBe(false);
  });
});
