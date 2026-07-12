/**
 * The Excalidraw renderer — a concrete {@link Renderer} for Excalidraw scenes.
 *
 * Assembles the mappers into full-document `render`/`parse`, and implements the
 * small accessor surface the generic synchronizer needs. This is the only place
 * that "knows Excalidraw" (its JSON shape) — the engine core stays agnostic.
 *
 * `render` is a pure function of the document (deterministic ids/seeds), so equal
 * documents produce byte-identical scenes. `parse` reconstructs the document from
 * element escrow (authoritative) with geometry/style/label overlaid from the
 * elements, and rebuilds document-level entities (groups, layers, styles, …) from
 * the appState escrow — degrading gracefully when that escrow is absent.
 */

import type {
  DiagramDocument,
  DiagramNode,
  DiagramEdge,
  DocumentId,
  Viewport,
} from '@/dsl';
import { stableStringify, CURRENT_SCHEMA_VERSION } from '@/dsl';
import type { Renderer, RenderResult, ParseResult, RendererCapabilities } from '../../renderer/Renderer';
import type { RendererContext } from '../../renderer/RendererContext';
import type { EngineConfig } from '../../renderer/RendererConfig';
import { CUSTOM_DATA_KEY } from './constants';
import { nonceFrom } from './hash';
import type { ExcalidrawScene, ExElement, ExAppState, ExTextElement, ExLinearElement } from './types';
import { readElementEscrow, readDocumentEscrow } from './escrow';
import type { DocumentEscrow } from './escrow';
import { renderNode as mapNode, parseNode } from './mappers/NodeMapper';
import { renderEdge as mapEdge, parseEdge } from './mappers/EdgeMapper';
import { computePlacements, placementFor, renderFrames } from './mappers/GroupMapper';
import { viewportToAppState, appStateToViewport } from './mappers/ViewportMapper';

const CAPABILITIES: RendererCapabilities = {
  bidirectional: true,
  incremental: true,
  groups: true,
  viewport: true,
};

const VOLATILE_KEYS = new Set(['version', 'versionNonce', 'updated']);

function buildDocumentEscrow(doc: DiagramDocument): DocumentEscrow {
  return {
    v: 1,
    documentId: doc.id,
    name: doc.name,
    schemaVersion: doc.schemaVersion,
    metadata: doc.metadata,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    viewport: doc.viewport,
    styles: doc.styles,
    groups: doc.groups,
    layers: doc.layers,
    tags: doc.tags,
    annotations: doc.annotations,
    comments: doc.comments,
  };
}

function appStateFor(doc: DiagramDocument, config: EngineConfig): ExAppState {
  return {
    ...viewportToAppState(doc.viewport, config.gridSize),
    [CUSTOM_DATA_KEY]: buildDocumentEscrow(doc),
  };
}

/** True when a text element is a bound label rather than a standalone node. */
function isLabelElement(element: ExElement): boolean {
  return element.type === 'text' && readElementEscrow(element)?.kind === 'label';
}

function labelOwner(element: ExElement): string | undefined {
  const escrow = readElementEscrow(element);
  return escrow?.kind === 'label' ? escrow.ownerId : undefined;
}

/** Merge the escrowed viewport with values that manual edits may have changed. */
function reconstructViewport(escrow: DocumentEscrow | undefined, appState: ExAppState): Viewport {
  const derived = appStateToViewport(appState);
  if (!escrow) return derived;
  return {
    ...escrow.viewport,
    zoom: derived.zoom,
    pan: derived.pan,
    background: derived.background,
    grid: { ...escrow.viewport.grid, enabled: derived.grid.enabled, size: derived.grid.size },
  };
}

export class ExcalidrawRenderer implements Renderer<ExcalidrawScene, ExElement> {
  readonly id = 'excalidraw';
  readonly capabilities = CAPABILITIES;

  // ── DSL → scene ────────────────────────────────────────────────────────────
  render(doc: DiagramDocument, ctx: RendererContext): RenderResult<ExcalidrawScene> {
    const epoch = ctx.config.epoch;
    const placements = computePlacements(doc);
    const elements: ExElement[] = [];

    // Frames first (behind), then nodes by z-order, then edges on top.
    elements.push(...renderFrames(doc, epoch));
    const nodes = Object.values(doc.nodes).sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
    for (const node of nodes) {
      elements.push(...mapNode(node, doc, ctx, placements.get(node.id)));
    }
    for (const edge of Object.values(doc.edges)) {
      elements.push(...mapEdge(edge, doc, ctx));
    }

    const scene: ExcalidrawScene = { elements, appState: appStateFor(doc, ctx.config), files: {} };
    return { scene, warnings: ctx.warnings };
  }

  // ── scene → DSL ────────────────────────────────────────────────────────────
  parse(scene: ExcalidrawScene, ctx: RendererContext): ParseResult {
    const labelsByOwner = new Map<string, ExTextElement>();
    for (const element of scene.elements) {
      const owner = labelOwner(element);
      if (owner !== undefined && element.type === 'text') labelsByOwner.set(owner, element);
    }

    const nodes: Record<string, DiagramNode> = {};
    const edges: Record<string, DiagramEdge> = {};

    for (const element of scene.elements) {
      if (element.type === 'frame') continue; // frames reconstruct from escrow as groups
      if (isLabelElement(element)) continue; // consumed by its owner
      if (element.type === 'arrow') {
        const edge = parseEdge(element as ExLinearElement, labelsByOwner.get(element.id), ctx);
        edges[edge.id] = edge;
        continue;
      }
      if (element.type === 'line') continue; // free lines aren't modeled as DSL nodes
      const node = parseNode(element, labelsByOwner.get(element.id), ctx);
      nodes[node.id] = node;
    }

    const escrow = readDocumentEscrow(scene.appState);
    const viewport = reconstructViewport(escrow, scene.appState);

    const document: DiagramDocument = {
      schemaVersion: escrow?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      id: (escrow?.documentId ?? 'document_parsed') as DocumentId,
      name: escrow?.name,
      metadata: escrow?.metadata ?? {},
      createdAt: escrow?.createdAt ?? ctx.clock.now(),
      updatedAt: escrow?.updatedAt ?? ctx.clock.now(),
      viewport,
      nodes,
      edges,
      groups: escrow?.groups ?? {},
      layers: escrow?.layers ?? {},
      styles: escrow?.styles ?? {},
      tags: escrow?.tags ?? {},
      annotations: escrow?.annotations ?? {},
      comments: escrow?.comments ?? {},
    };
    return { document, warnings: ctx.warnings };
  }

  // ── Entity-level (for sync) ────────────────────────────────────────────────
  renderNode(node: DiagramNode, doc: DiagramDocument, ctx: RendererContext): ExElement[] {
    return mapNode(node, doc, ctx, placementFor(doc, node.id));
  }

  renderEdge(edge: DiagramEdge, doc: DiagramDocument, ctx: RendererContext): ExElement[] {
    return mapEdge(edge, doc, ctx);
  }

  // ── Scene plumbing ─────────────────────────────────────────────────────────
  elementId(element: ExElement): string {
    return element.id;
  }

  getElements(scene: ExcalidrawScene): readonly ExElement[] {
    return scene.elements;
  }

  withElements(scene: ExcalidrawScene, elements: readonly ExElement[]): ExcalidrawScene {
    return { ...scene, elements };
  }

  elementsEqual(a: ExElement, b: ExElement): boolean {
    return stableStringify(withoutVolatile(a)) === stableStringify(withoutVolatile(b));
  }

  bumpVersion(next: ExElement, previous: ExElement): ExElement {
    const version = previous.version + 1;
    return { ...next, version, versionNonce: nonceFrom(next.id, version) };
  }

  applyViewport(scene: ExcalidrawScene, doc: DiagramDocument, ctx: RendererContext): ExcalidrawScene {
    return { ...scene, appState: appStateFor(doc, ctx.config) };
  }

  emptyScene(): ExcalidrawScene {
    return { elements: [], appState: {}, files: {} };
  }
}

/** Strip reconciliation-volatile fields for content comparison. */
function withoutVolatile(element: ExElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(element)) {
    if (!VOLATILE_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** The default, shared Excalidraw renderer instance. */
export const excalidrawRenderer = new ExcalidrawRenderer();
