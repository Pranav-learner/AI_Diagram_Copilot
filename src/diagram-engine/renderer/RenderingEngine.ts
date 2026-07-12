/**
 * The RenderingEngine — the orchestrator façade over the pipeline.
 *
 * `DSL → validate → render / sync → scene` (and `scene → parse → DSL`). It selects
 * a renderer from the {@link RendererRegistry}, threads a fresh
 * {@link RendererContext} per call, validates before rendering, and emits typed
 * {@link EngineEventMap} events observers (future AI, presence, telemetry)
 * subscribe to. It knows nothing about Excalidraw, React, or the backend.
 */

import type { DiagramDocument, NodeTypeRegistry, Clock, DocumentDiff } from '@/dsl';
import { validate } from '@/dsl';
import { RendererRegistry } from './RendererRegistry';
import type { Renderer, RenderResult, ParseResult } from './Renderer';
import { createContext } from './RendererContext';
import type { EngineConfig } from './RendererConfig';
import { resolveConfig } from './RendererConfig';
import { EventEmitter } from '../events/EventEmitter';
import type { EngineEventMap } from '../events/events';
import { EngineEventName } from '../events/events';
import { RenderError, RendererNotFoundError } from '../errors';
import { synchronize } from '../sync/SceneSynchronizer';
import type { SyncResult } from '../sync/SceneSynchronizer';

export interface RenderingEngineOptions {
  readonly config?: Partial<EngineConfig>;
  readonly nodeTypes?: NodeTypeRegistry;
  readonly clock?: Clock;
  /** Renderer id used when a call omits one (defaults to the first registered). */
  readonly defaultRenderer?: string;
}

function entityCount(doc: DiagramDocument): number {
  return Object.keys(doc.nodes).length + Object.keys(doc.edges).length;
}

export class RenderingEngine {
  readonly events = new EventEmitter<EngineEventMap>();
  readonly registry: RendererRegistry;

  private readonly config: EngineConfig;
  private readonly nodeTypes?: NodeTypeRegistry;
  private readonly clock?: Clock;
  private readonly defaultRenderer?: string;

  constructor(
    registry: RendererRegistry = new RendererRegistry(),
    options: RenderingEngineOptions = {},
  ) {
    this.registry = registry;
    this.config = resolveConfig(options.config);
    this.nodeTypes = options.nodeTypes;
    this.clock = options.clock;
    this.defaultRenderer = options.defaultRenderer;
  }

  /** Register a renderer (convenience delegate to the registry). Chainable. */
  register<TScene, TElement>(renderer: Renderer<TScene, TElement>): this {
    this.registry.register(renderer);
    return this;
  }

  /** DSL → scene. Validates first (unless disabled); invalid → {@link RenderError}. */
  render<TScene, TElement>(doc: DiagramDocument, rendererId?: string): RenderResult<TScene> {
    const renderer = this.require<TScene, TElement>(rendererId);
    this.assertValid(doc);
    const result = renderer.render(doc, this.context());
    this.events.emit(EngineEventName.RendererReady, { rendererId: renderer.id });
    this.events.emit(EngineEventName.SceneChanged, {
      rendererId: renderer.id,
      changedCount: entityCount(doc),
    });
    return result;
  }

  /** scene → DSL (reverse). */
  parse<TScene, TElement>(scene: TScene, rendererId?: string): ParseResult {
    const renderer = this.require<TScene, TElement>(rendererId);
    const result = renderer.parse(scene, this.context());
    this.events.emit(EngineEventName.SceneChanged, {
      rendererId: renderer.id,
      changedCount: entityCount(result.document),
    });
    return result;
  }

  /** Incremental update: emit only what changed between two documents. */
  sync<TScene, TElement>(
    prevDoc: DiagramDocument,
    nextDoc: DiagramDocument,
    currentScene: TScene,
    rendererId?: string,
  ): SyncResult<TScene, TElement> {
    const renderer = this.require<TScene, TElement>(rendererId);
    this.assertValid(nextDoc);
    const result = synchronize(renderer, currentScene, prevDoc, nextDoc, this.context());
    this.emitSyncEvents(renderer.id, result.diff, nextDoc);
    return result;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private context() {
    return createContext({ config: this.config, nodeTypes: this.nodeTypes, clock: this.clock });
  }

  private require<TScene, TElement>(rendererId?: string): Renderer<TScene, TElement> {
    const id = rendererId ?? this.defaultRenderer ?? this.registry.ids()[0];
    if (id === undefined) throw new RendererNotFoundError('<none registered>');
    const renderer = this.registry.get<TScene, TElement>(id);
    if (!renderer) throw new RendererNotFoundError(id);
    return renderer;
  }

  private assertValid(doc: DiagramDocument): void {
    if (!this.config.validate) return;
    const result = validate(doc);
    if (!result.valid) {
      throw new RenderError(
        `Cannot render an invalid document (${result.errors.length} error(s))`,
        result.errors,
      );
    }
  }

  private emitSyncEvents(rendererId: string, diff: DocumentDiff, nextDoc: DiagramDocument): void {
    for (const node of diff.nodes.added) this.events.emit(EngineEventName.NodeCreated, { node });
    for (const change of diff.nodes.changed)
      this.events.emit(EngineEventName.NodeUpdated, { node: change.after });
    for (const node of diff.nodes.removed)
      this.events.emit(EngineEventName.NodeDeleted, { nodeId: node.id });

    for (const edge of diff.edges.added) this.events.emit(EngineEventName.EdgeCreated, { edge });
    for (const change of diff.edges.changed)
      this.events.emit(EngineEventName.EdgeUpdated, { edge: change.after });
    for (const edge of diff.edges.removed)
      this.events.emit(EngineEventName.EdgeDeleted, { edgeId: edge.id });

    if (diff.viewportChanged)
      this.events.emit(EngineEventName.ViewportChanged, { viewport: nextDoc.viewport });

    this.events.emit(EngineEventName.SceneChanged, { rendererId, changedCount: entityCount(nextDoc) });
  }
}
