/**
 * The pluggable renderer contract — the heart of renderer independence.
 *
 * A `Renderer<TScene, TElement>` is a **bidirectional, incremental** translator
 * between a DSL {@link DiagramDocument} and some concrete scene format. The
 * engine core (`RenderingEngine`, registry, synchronizer) speaks only this
 * interface and never names Excalidraw. Adding a Mermaid/SVG/Draw.io backend is
 * exactly: implement this interface and register it.
 *
 * The interface is split into three concerns:
 *  1. **Whole-document** — `render` (DSL→scene) and `parse` (scene→DSL).
 *  2. **Entity-level** — `renderNode`/`renderEdge`, used by the synchronizer to
 *     re-render only what changed (a node may expand to several elements, e.g. a
 *     shape plus its bound label).
 *  3. **Scene plumbing** — small accessors (`getElements`, `withElements`,
 *     `elementId`, `elementsEqual`, `bumpVersion`, `applyViewport`) that let the
 *     *generic* synchronizer manipulate a scene without knowing its shape.
 */

import type { DiagramDocument, DiagramNode, DiagramEdge } from '@/dsl';
import type { Warning } from '../types';
import type { RendererContext } from './RendererContext';

export interface RendererCapabilities {
  readonly bidirectional: boolean;
  readonly incremental: boolean;
  readonly groups: boolean;
  readonly viewport: boolean;
}

export interface RenderResult<TScene> {
  readonly scene: TScene;
  readonly warnings: readonly Warning[];
}

export interface ParseResult {
  readonly document: DiagramDocument;
  readonly warnings: readonly Warning[];
}

export interface Renderer<TScene, TElement> {
  readonly id: string;
  readonly capabilities: RendererCapabilities;

  // ── Whole-document ────────────────────────────────────────────────────────
  /** DSL → scene (full render). Pure and deterministic. */
  render(doc: DiagramDocument, ctx: RendererContext): RenderResult<TScene>;
  /** scene → DSL (reverse map manual edits back into the source of truth). */
  parse(scene: TScene, ctx: RendererContext): ParseResult;

  // ── Entity-level (for incremental sync) ─────────────────────────────────────
  /** Render one node to its element(s) — includes derived elements (labels). */
  renderNode(node: DiagramNode, doc: DiagramDocument, ctx: RendererContext): TElement[];
  /** Render one edge to its element(s). */
  renderEdge(edge: DiagramEdge, doc: DiagramDocument, ctx: RendererContext): TElement[];

  // ── Scene plumbing (renderer-agnostic manipulation) ────────────────────────
  /** The stable id of an element (matches the DSL id, or a derived suffix). */
  elementId(element: TElement): string;
  getElements(scene: TScene): readonly TElement[];
  withElements(scene: TScene, elements: readonly TElement[]): TScene;
  /** Structural equality ignoring volatile fields (version/nonce/timestamps). */
  elementsEqual(a: TElement, b: TElement): boolean;
  /** Return a copy with its reconciliation version advanced. */
  bumpVersion(element: TElement): TElement;
  /** Apply the document's viewport to the scene (appState only, no elements). */
  applyViewport(scene: TScene, doc: DiagramDocument, ctx: RendererContext): TScene;
  /** An empty scene (used as the base for a full render). */
  emptyScene(): TScene;
}
