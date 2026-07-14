/**
 * SemanticEntity — a renderer-independent node in the Semantic Graph (the IR).
 *
 * This is the compiler-front-end analogue of a *typed symbol*: it captures what a
 * diagram element **means** (its {@link EntityKind}), not how it is drawn. The
 * Diagram DSL is the "source code"; a {@link SemanticEntity} is one node of the
 * intermediate representation every future AI capability reasons over. No
 * Excalidraw / renderer concepts leak here — only geometry (pure math), identity,
 * role, tags, attributes, and provenance.
 */

import type { MetadataValue } from '@/dsl';

/**
 * Canonical, renderer-independent classification of an entity's *meaning*.
 *
 * The set is intentionally **open** (`(string & {})`): the built-in members give
 * autocomplete + exhaustiveness for the common architecture/flow vocabulary, but
 * a diagram may carry any domain-specific kind (e.g. `'kafka-topic'`). The
 * classifier ({@link inferEntityKind}) maps raw DSL roles/shapes onto these; an
 * unrecognised role is preserved verbatim rather than flattened to `unknown`.
 */
export type EntityKind =
  // Architecture / infrastructure
  | 'service'
  | 'api'
  | 'gateway'
  | 'database'
  | 'cache'
  | 'queue'
  | 'server'
  | 'cloud'
  | 'storage'
  | 'loadBalancer'
  | 'function'
  | 'component'
  | 'externalSystem'
  // Actors
  | 'user'
  | 'actor'
  // Flow / process
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'event'
  | 'state'
  | 'task'
  // Data / modelling
  | 'entity'
  | 'class'
  | 'interface'
  | 'document'
  // Presentation-only (carry little semantic weight but must be representable)
  | 'text'
  | 'image'
  | 'icon'
  | 'container'
  | 'annotation'
  // Fallback
  | 'unknown'
  | (string & {});

/** Broad families a kind belongs to — used by summaries/topology heuristics. */
export type EntityCategory =
  | 'compute'
  | 'data'
  | 'messaging'
  | 'network'
  | 'actor'
  | 'control-flow'
  | 'model'
  | 'presentation'
  | 'other';

/** Pure, renderer-independent geometry. Never an Excalidraw element. */
export interface EntityGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** width × height — precomputed for superlative queries (largest/smallest). */
  readonly area: number;
  /** Center point — convenient for spatial reasoning. */
  readonly cx: number;
  readonly cy: number;
  /** Stacking order (higher = more salient); used to rank when truncating. */
  readonly z: number;
}

/**
 * A connection anchor on an entity. The DSL models ports implicitly on edge
 * endpoints ({@link Endpoint.port}/`anchor`); the builder surfaces the distinct
 * anchors an entity actually participates in, with the relationships that use them.
 */
export interface SemanticPort {
  /** Stable within the entity: an explicit `PortId` or a synthesised anchor key. */
  readonly id: string;
  /** `top | right | bottom | left | center`, when the endpoint specified one. */
  readonly anchor?: string;
  /** Relationship ids that attach at this port. */
  readonly relationshipIds: readonly string[];
}

/** Provenance: how this semantic entity maps back to the DSL "source code". */
export interface EntitySource {
  /** DSL structural discriminant: `shape | text | image | icon | container`. */
  readonly nodeType: string;
  /** DSL `ShapeNode.shape` (e.g. `cylinder`), when applicable. */
  readonly shape?: string;
  /** Raw DSL `ShapeNode.semantic` role string, preserved for provenance/debug. */
  readonly role?: string;
}

export interface SemanticEntity {
  /** Identity — equals the DSL node id (stable across edits). */
  readonly id: string;
  /** Classified semantic meaning. */
  readonly kind: EntityKind;
  /** Broad family derived from {@link kind}. */
  readonly category: EntityCategory;
  /** Human label (node label → text → id fallback). */
  readonly label: string;
  /** Optional prose description (from `metadata.description`). */
  readonly description?: string;
  /** Resolved tag labels (DSL `tagIds` dereferenced to `DiagramTag.label`). */
  readonly tags: readonly string[];
  /** Owning group id (DSL `node.groupId`), if any. */
  readonly groupId?: string;
  /** Owning layer id (DSL `node.layerId`), if any. */
  readonly layerId?: string;
  /** Domain attributes — metadata minus internal/engine keys. */
  readonly attributes: Readonly<Record<string, MetadataValue>>;
  /** Ports the entity participates in (derived from edge endpoints). */
  readonly ports: readonly SemanticPort[];
  /** Renderer-independent geometry. */
  readonly geometry: EntityGeometry;
  /** DSL provenance. */
  readonly source: EntitySource;
  /** True when this entity classification was inferred vs. explicit in the DSL. */
  readonly inferred: boolean;
}

/** Map every {@link EntityKind} to its {@link EntityCategory}. Open-set safe. */
const KIND_CATEGORY: Readonly<Record<string, EntityCategory>> = {
  service: 'compute',
  api: 'compute',
  gateway: 'network',
  loadBalancer: 'network',
  server: 'compute',
  function: 'compute',
  component: 'compute',
  cloud: 'network',
  externalSystem: 'network',
  database: 'data',
  cache: 'data',
  storage: 'data',
  queue: 'messaging',
  user: 'actor',
  actor: 'actor',
  start: 'control-flow',
  end: 'control-flow',
  process: 'control-flow',
  decision: 'control-flow',
  event: 'control-flow',
  state: 'control-flow',
  task: 'control-flow',
  entity: 'model',
  class: 'model',
  interface: 'model',
  document: 'model',
  text: 'presentation',
  image: 'presentation',
  icon: 'presentation',
  container: 'presentation',
  annotation: 'presentation',
  unknown: 'other',
};

/** Resolve the broad family for a kind (defaults to `other` for open kinds). */
export function categoryOf(kind: EntityKind): EntityCategory {
  return KIND_CATEGORY[kind] ?? 'other';
}
