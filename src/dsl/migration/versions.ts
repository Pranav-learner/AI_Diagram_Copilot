/**
 * Schema version registry.
 *
 * `CURRENT_SCHEMA_VERSION` is the version every freshly-created document is
 * stamped with and the target every migration chain climbs to. `MIGRATIONS`
 * lists ordered upgrade steps; it is empty today (1.0.0 is the first version)
 * but the machinery exists so a future `1.0.0 -> 1.1.0` step is a one-line
 * addition — no format break for stored documents.
 */

export const CURRENT_SCHEMA_VERSION = '1.0.0';

/** An untyped, freshly-parsed document prior to structural validation. */
export type RawDocument = Record<string, unknown>;

/**
 * A single, ordered upgrade step. `up` transforms a document from `from` to
 * `to` in place-agnostic, pure fashion (it must not mutate its input).
 */
export interface Migration {
  readonly from: string;
  readonly to: string;
  up(doc: RawDocument): RawDocument;
}

/** All registered migrations, oldest first. */
export const MIGRATIONS: readonly Migration[] = [];
