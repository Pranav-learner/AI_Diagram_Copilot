/**
 * The node-type registry — the extensibility seam for semantic node types.
 *
 * The {@link ShapeNode} union member is deliberately generic (shape + optional
 * semantic). Instead of hard-coding 20 domain types into the type system, we
 * register their *defaults* (which shape, default size/style/label) at runtime.
 * A future module — or an AI plugin — adds a new node type by calling
 * `register(...)`, with **no change to the core union or any switch statement**.
 * This is what makes "future node types require minimal code changes" true.
 */

import type { Size } from '../primitives/geometry';
import type { Metadata } from '../core/metadata';
import type { ShapeKind, SemanticType } from './node';
import type { Style } from './style';

/** Defaults associated with a semantic node type. */
export interface NodeTypeDefinition {
  readonly semantic: SemanticType;
  /** Which visual primitive this semantic type renders as by default. */
  readonly shape: ShapeKind;
  /** Human label / default node label text. */
  readonly label?: string;
  readonly defaultSize?: Size;
  readonly defaultStyle?: Style;
  /** Metadata merged onto nodes created from this type (e.g. category). */
  readonly metadata?: Metadata;
}

/**
 * A mutable, extensible registry of {@link NodeTypeDefinition}s. Instances are
 * cheap; the DSL ships a preloaded {@link defaultNodeTypeRegistry} but callers
 * can build their own for isolation (e.g. per-tenant custom types).
 */
export class NodeTypeRegistry {
  private readonly defs = new Map<string, NodeTypeDefinition>();

  /** Register (or override) a semantic type. Chainable. */
  register(def: NodeTypeDefinition): this {
    this.defs.set(def.semantic, def);
    return this;
  }

  has(semantic: SemanticType): boolean {
    return this.defs.has(semantic);
  }

  get(semantic: SemanticType): NodeTypeDefinition | undefined {
    return this.defs.get(semantic);
  }

  /** All registered definitions. */
  list(): readonly NodeTypeDefinition[] {
    return [...this.defs.values()];
  }

  /** A deep-ish copy so callers can extend without mutating the shared default. */
  clone(): NodeTypeRegistry {
    const copy = new NodeTypeRegistry();
    for (const def of this.defs.values()) copy.register(def);
    return copy;
  }
}

/** The built-in semantic types, mapping each to a sensible default shape. */
const BUILTIN_DEFINITIONS: readonly NodeTypeDefinition[] = [
  { semantic: 'decision', shape: 'diamond', label: 'Decision' },
  { semantic: 'database', shape: 'cylinder', label: 'Database' },
  { semantic: 'service', shape: 'roundedRectangle', label: 'Service' },
  { semantic: 'queue', shape: 'rectangle', label: 'Queue' },
  { semantic: 'cache', shape: 'cylinder', label: 'Cache' },
  { semantic: 'api', shape: 'hexagon', label: 'API' },
  { semantic: 'user', shape: 'rectangle', label: 'User' },
  { semantic: 'cloud', shape: 'cloud', label: 'Cloud' },
  { semantic: 'server', shape: 'rectangle', label: 'Server' },
  { semantic: 'process', shape: 'roundedRectangle', label: 'Process' },
  { semantic: 'terminator', shape: 'ellipse', label: 'Terminator' },
  { semantic: 'custom', shape: 'rectangle', label: 'Custom' },
];

/** Create a registry preloaded with the built-in semantic types. */
export function createDefaultNodeTypeRegistry(): NodeTypeRegistry {
  const registry = new NodeTypeRegistry();
  for (const def of BUILTIN_DEFINITIONS) registry.register(def);
  return registry;
}

/** Shared, preloaded registry. Prefer {@link NodeTypeRegistry.clone} to extend. */
export const defaultNodeTypeRegistry = createDefaultNodeTypeRegistry();
