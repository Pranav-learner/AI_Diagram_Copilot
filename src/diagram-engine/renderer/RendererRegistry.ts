/**
 * A registry of renderers keyed by id.
 *
 * Enables multiple rendering backends to coexist (Excalidraw today; Mermaid/SVG
 * tomorrow) and be selected by id at call time. Heterogeneous renderers can't
 * share one generic parameter, so they are stored type-erased and re-typed on
 * `get` — the only casts in the module, contained here.
 */

import type { Renderer } from './Renderer';

export class RendererRegistry {
  private readonly renderers = new Map<string, unknown>();

  /** Register (or replace) a renderer. Chainable. */
  register<TScene, TElement>(renderer: Renderer<TScene, TElement>): this {
    this.renderers.set(renderer.id, renderer);
    return this;
  }

  has(id: string): boolean {
    return this.renderers.has(id);
  }

  get<TScene, TElement>(id: string): Renderer<TScene, TElement> | undefined {
    return this.renderers.get(id) as Renderer<TScene, TElement> | undefined;
  }

  ids(): readonly string[] {
    return [...this.renderers.keys()];
  }
}
