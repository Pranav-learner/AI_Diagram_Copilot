/**
 * Version migration.
 *
 * `applyMigrations` is the pure, testable core: given a raw document, an ordered
 * migration list, and a target version, it walks the chain from the document's
 * current `schemaVersion` up to the target. `migrate` wires it to the built-in
 * registry and current version. Refuses to "downgrade" documents authored by a
 * newer version of the schema than this build understands.
 */

import { compareSemVer } from '../primitives/scalars';
import { DiagramShapeError, DiagramMigrationError } from '../core/errors';
import type { DiagramDocument } from '../model/document';
import type { Migration, RawDocument } from './versions';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from './versions';

/** True if `version` is older than the current schema and needs upgrading. */
export function needsMigration(version: string, target = CURRENT_SCHEMA_VERSION): boolean {
  return compareSemVer(version, target) < 0;
}

/**
 * Apply the migration chain to bring `raw` up to `target`. Pure — exported
 * separately so migration logic is unit-testable with a synthetic chain.
 */
export function applyMigrations(
  raw: RawDocument,
  migrations: readonly Migration[],
  target: string,
): RawDocument {
  let current = raw;
  let version = readVersion(current);

  const cmp = compareSemVer(version, target);
  if (cmp === 0) return current;
  if (cmp > 0) {
    throw new DiagramMigrationError(
      `Document schema version "${version}" is newer than supported "${target}"`,
    );
  }

  const remaining = new Set(migrations);
  while (compareSemVer(version, target) < 0) {
    const step = [...remaining].find((m) => m.from === version);
    if (!step) {
      throw new DiagramMigrationError(
        `No migration path from "${version}" to "${target}"`,
      );
    }
    current = step.up(current);
    version = step.to;
    remaining.delete(step);
  }
  return current;
}

function readVersion(raw: RawDocument): string {
  const version = raw['schemaVersion'];
  if (typeof version !== 'string') {
    throw new DiagramShapeError('Document is missing a string "schemaVersion"');
  }
  return version;
}

/**
 * Migrate a freshly-parsed document to the current schema version using the
 * built-in migration registry. Returns the upgraded raw document (structural
 * validation is the caller's responsibility, e.g. in `deserialize`).
 */
export function migrate(raw: unknown): DiagramDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DiagramShapeError('Document must be a JSON object');
  }
  const upgraded = applyMigrations(
    raw as RawDocument,
    MIGRATIONS,
    CURRENT_SCHEMA_VERSION,
  );
  return upgraded as unknown as DiagramDocument;
}
