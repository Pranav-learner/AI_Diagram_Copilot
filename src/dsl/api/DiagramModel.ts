/**
 * DiagramModel — the ergonomic, stateful facade over the functional core.
 *
 * The document itself is immutable plain data; `DiagramModel` holds a *reference*
 * to the current document and, on each mutation, swaps in the new immutable
 * document returned by the pure {@link operations}. This gives callers (and
 * future AI modules) a clean object API — `model.createNode(...)`,
 * `model.validate()`, `model.serialize()` — so **nobody manipulates raw JSON**,
 * while serialization/diff stay trivial because `model.document` *is* the data.
 *
 * It carries the injected {@link IdFactory}, {@link Clock}, and
 * {@link NodeTypeRegistry}, so entity creation is deterministic and
 * registry-extensible.
 */

import type { IdFactory } from '../primitives/ids';
import type {
  NodeId,
  EdgeId,
  GroupId,
  LayerId,
  DocumentId,
  StyleId,
  TagId,
  AnnotationId,
  CommentId,
} from '../primitives/ids';
import { createUuidIdFactory } from '../primitives/ids';
import type { Clock } from '../primitives/scalars';
import { systemClock } from '../primitives/scalars';
import type { MetadataValue } from '../core/metadata';
import { getMeta } from '../core/metadata';
import { NodeTypeRegistry, defaultNodeTypeRegistry } from '../model/registry';
import type { DiagramDocument } from '../model/document';
import { createEmptyDocument } from '../model/document';
import type { DiagramNode } from '../model/node';
import type { DiagramEdge } from '../model/edge';
import type { DiagramGroup, GroupChildId } from '../model/group';
import type { Layer } from '../model/layer';
import type { NamedStyle } from '../model/style';
import type { DiagramTag } from '../model/tag';
import type { Annotation } from '../model/annotation';
import type { DiagramComment } from '../model/comment';
import type { Viewport } from '../model/viewport';
import { CURRENT_SCHEMA_VERSION } from '../migration/versions';
import { validate } from '../validation/validate';
import type { ValidationResult } from '../validation/codes';
import { serialize, deserialize } from '../serialization/serialize';
import { deepClone } from '../serialization/clone';
import type {
  BuildContext,
  NewNode,
  NewEdge,
  NewGroup,
  NewLayer,
  NewStyle,
  NewTag,
  NewAnnotation,
  NewComment,
} from './factory';
import {
  buildNode,
  buildEdge,
  buildGroup,
  buildLayer,
  buildNamedStyle,
  buildTag,
  buildAnnotation,
  buildComment,
} from './factory';
import type { NodePatch, EdgePatch } from './operations';
import * as ops from './operations';

export interface DiagramModelOptions {
  readonly ids?: IdFactory;
  readonly clock?: Clock;
  readonly registry?: NodeTypeRegistry;
}

export interface CreateModelOptions extends DiagramModelOptions {
  readonly id?: DocumentId;
  readonly name?: string;
}

export class DiagramModel {
  private doc: DiagramDocument;
  private readonly ids: IdFactory;
  private readonly clock: Clock;
  private readonly registry: NodeTypeRegistry;

  constructor(doc: DiagramDocument, options: DiagramModelOptions = {}) {
    this.doc = doc;
    this.ids = options.ids ?? createUuidIdFactory();
    this.clock = options.clock ?? systemClock;
    this.registry = options.registry ?? defaultNodeTypeRegistry;
  }

  // ── Construction ────────────────────────────────────────────────────────

  /** Create a model backed by a fresh, empty document. */
  static create(options: CreateModelOptions = {}): DiagramModel {
    const ids = options.ids ?? createUuidIdFactory();
    const clock = options.clock ?? systemClock;
    const doc = createEmptyDocument({
      id: options.id ?? ids.document(),
      name: options.name,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      clock,
    });
    return new DiagramModel(doc, { ...options, ids, clock });
  }

  /** Wrap an existing document (already trusted/validated). */
  static fromDocument(doc: DiagramDocument, options?: DiagramModelOptions): DiagramModel {
    return new DiagramModel(doc, options);
  }

  /** Parse + migrate a serialized document, then wrap it. */
  static fromJSON(input: string | unknown, options?: DiagramModelOptions): DiagramModel {
    return new DiagramModel(deserialize(input), options);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** The current immutable document — the serializable source of truth. */
  get document(): DiagramDocument {
    return this.doc;
  }

  private get ctx(): BuildContext {
    return { ids: this.ids, clock: this.clock };
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  createNode(spec: NewNode): DiagramNode {
    const node = buildNode(this.ctx, spec, this.registry);
    this.doc = ops.addNode(this.doc, node, this.clock);
    return node;
  }

  updateNode(id: NodeId, patch: NodePatch): DiagramNode | undefined {
    this.doc = ops.updateNode(this.doc, id, patch, this.clock);
    return this.doc.nodes[id];
  }

  removeNode(id: NodeId): boolean {
    const existed = id in this.doc.nodes;
    this.doc = ops.removeNode(this.doc, id, this.clock);
    return existed;
  }

  findNode(id: NodeId): DiagramNode | undefined {
    return this.doc.nodes[id];
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  createEdge(spec: NewEdge): DiagramEdge {
    const edge = buildEdge(this.ctx, spec);
    this.doc = ops.addEdge(this.doc, edge, this.clock);
    return edge;
  }

  updateEdge(id: EdgeId, patch: EdgePatch): DiagramEdge | undefined {
    this.doc = ops.updateEdge(this.doc, id, patch, this.clock);
    return this.doc.edges[id];
  }

  removeEdge(id: EdgeId): boolean {
    const existed = id in this.doc.edges;
    this.doc = ops.removeEdge(this.doc, id, this.clock);
    return existed;
  }

  findEdge(id: EdgeId): DiagramEdge | undefined {
    return this.doc.edges[id];
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  createGroup(spec: NewGroup = {}): DiagramGroup {
    const group = buildGroup(this.ctx, spec);
    this.doc = ops.addGroup(this.doc, group, this.clock);
    return group;
  }

  addToGroup(groupId: GroupId, childId: GroupChildId): this {
    this.doc = ops.addToGroup(this.doc, groupId, childId, this.clock);
    return this;
  }

  removeFromGroup(groupId: GroupId, childId: GroupChildId): this {
    this.doc = ops.removeFromGroup(this.doc, groupId, childId, this.clock);
    return this;
  }

  removeGroup(id: GroupId): boolean {
    const existed = id in this.doc.groups;
    this.doc = ops.removeGroup(this.doc, id, this.clock);
    return existed;
  }

  findGroup(id: GroupId): DiagramGroup | undefined {
    return this.doc.groups[id];
  }

  // ── Layers / styles / tags / annotations / comments ───────────────────────

  addLayer(spec: NewLayer): Layer {
    const layer = buildLayer(this.ctx, spec);
    this.doc = ops.addLayer(this.doc, layer, this.clock);
    return layer;
  }

  removeLayer(id: LayerId): boolean {
    const existed = id in this.doc.layers;
    this.doc = ops.removeLayer(this.doc, id, this.clock);
    return existed;
  }

  defineStyle(spec: NewStyle): NamedStyle {
    const style = buildNamedStyle(this.ctx, spec);
    this.doc = ops.defineStyle(this.doc, style, this.clock);
    return style;
  }

  removeStyle(id: StyleId): boolean {
    const existed = id in this.doc.styles;
    this.doc = ops.removeStyle(this.doc, id, this.clock);
    return existed;
  }

  createTag(spec: NewTag): DiagramTag {
    const tag = buildTag(this.ctx, spec);
    this.doc = ops.addTag(this.doc, tag, this.clock);
    return tag;
  }

  removeTag(id: TagId): boolean {
    const existed = id in this.doc.tags;
    this.doc = ops.removeTag(this.doc, id, this.clock);
    return existed;
  }

  createAnnotation(spec: NewAnnotation): Annotation {
    const annotation = buildAnnotation(this.ctx, spec);
    this.doc = ops.addAnnotation(this.doc, annotation, this.clock);
    return annotation;
  }

  removeAnnotation(id: AnnotationId): boolean {
    const existed = id in this.doc.annotations;
    this.doc = ops.removeAnnotation(this.doc, id, this.clock);
    return existed;
  }

  createComment(spec: NewComment): DiagramComment {
    const comment = buildComment(this.ctx, spec);
    this.doc = ops.addComment(this.doc, comment, this.clock);
    return comment;
  }

  removeComment(id: CommentId): boolean {
    const existed = id in this.doc.comments;
    this.doc = ops.removeComment(this.doc, id, this.clock);
    return existed;
  }

  // ── Document-level ──────────────────────────────────────────────────────

  setMetadata(key: string, value: MetadataValue): this {
    this.doc = ops.setDocumentMetadata(this.doc, key, value, this.clock);
    return this;
  }

  getMetadata(key: string): MetadataValue | undefined {
    return getMeta(this.doc.metadata, key);
  }

  setViewport(patch: Partial<Viewport>): this {
    this.doc = ops.setViewport(this.doc, patch, this.clock);
    return this;
  }

  // ── Cross-cutting ───────────────────────────────────────────────────────

  /** Validate the current document (referential integrity + schema). */
  validate(): ValidationResult {
    return validate(this.doc);
  }

  /** Serialize the current document to a stable JSON string. */
  serialize(): string {
    return serialize(this.doc);
  }

  /** The current document (alias of {@link document}) for `JSON.stringify`. */
  toJSON(): DiagramDocument {
    return this.doc;
  }

  /** Deep, independent copy — same ids, but no shared references. */
  clone(): DiagramModel {
    return new DiagramModel(deepClone(this.doc), {
      ids: this.ids,
      clock: this.clock,
      registry: this.registry,
    });
  }
}
