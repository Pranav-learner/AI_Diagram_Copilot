/**
 * LayoutEngine — registry + dispatch for layout algorithms.
 *
 * The application (never the LLM) computes positions. The engine holds a map of
 * {@link LayoutKind} → {@link LayoutAlgorithm}; callers ask for a kind and get
 * coordinates back. Adding a layout is one `register()` call — the extensibility
 * seam mirrors the DSL's renderer/operation registries. An unknown kind falls
 * back to a registered default rather than throwing, so a novel plan can never
 * dead-end the pipeline.
 */

import type { LayoutAlgorithm, LayoutInput, LayoutKind, LayoutResult } from './types';

export class LayoutEngine {
  private readonly algorithms = new Map<LayoutKind, LayoutAlgorithm>();
  private fallback: LayoutKind = 'grid';

  register(algorithm: LayoutAlgorithm): this {
    this.algorithms.set(algorithm.kind, algorithm);
    return this;
  }

  /** Set the kind used when an unknown kind is requested. Must be registered. */
  setFallback(kind: LayoutKind): this {
    this.fallback = kind;
    return this;
  }

  has(kind: LayoutKind): boolean {
    return this.algorithms.has(kind);
  }

  kinds(): readonly LayoutKind[] {
    return [...this.algorithms.keys()];
  }

  /** Compute positions for `input` using the given layout kind (or fallback). */
  compute(kind: LayoutKind, input: LayoutInput): LayoutResult {
    const algorithm = this.algorithms.get(kind) ?? this.algorithms.get(this.fallback);
    if (!algorithm) throw new Error(`No layout algorithm for "${kind}" and no fallback "${this.fallback}" registered`);
    return algorithm.compute(input);
  }
}
