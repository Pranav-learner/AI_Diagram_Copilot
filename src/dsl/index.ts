/**
 * The Diagram DSL — public API barrel.
 *
 * This is the ONLY entry point. Import everything from `@/dsl`; never reach into
 * subpaths. The DSL is a pure, renderer/backend/AI-agnostic domain model — it
 * imports nothing from React, Excalidraw, the API layer, or the DOM render tree.
 *
 * Most consumers use {@link DiagramModel} (the ergonomic facade). The underlying
 * plain-data types, pure operations, validation, serialization, migration, and
 * repository are all exported for advanced/functional use.
 */

// ── Primitives ──────────────────────────────────────────────────────────────
export * from './primitives/ids';
export * from './primitives/geometry';
export * from './primitives/scalars';

// ── Core ────────────────────────────────────────────────────────────────────
export * from './core/errors';
export * from './core/metadata';
export * from './core/entity';

// ── Model ───────────────────────────────────────────────────────────────────
export * from './model/node';
export * from './model/edge';
export * from './model/group';
export * from './model/layer';
export * from './model/style';
export * from './model/viewport';
export * from './model/annotation';
export * from './model/comment';
export * from './model/tag';
export * from './model/registry';
export * from './model/document';

// ── API ─────────────────────────────────────────────────────────────────────
export * from './api/factory';
export * from './api/DiagramModel';
/** Pure immutable document operations, namespaced to avoid polluting the root. */
export * as operations from './api/operations';
export type { NodePatch, EdgePatch } from './api/operations';

// ── Validation ──────────────────────────────────────────────────────────────
export * from './validation/codes';
export * from './validation/rules';
export * from './validation/validate';

// ── Serialization ───────────────────────────────────────────────────────────
export * from './serialization/serialize';
export * from './serialization/clone';
export * from './serialization/equals';
export * from './serialization/diff';

// ── Migration ───────────────────────────────────────────────────────────────
export * from './migration/versions';
export * from './migration/migrate';

// ── Repository ──────────────────────────────────────────────────────────────
export * from './repository/DiagramRepository';
export * from './repository/InMemoryDiagramRepository';
