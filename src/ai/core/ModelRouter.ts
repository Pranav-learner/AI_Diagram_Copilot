/**
 * Model routing — the seam for "future model routing".
 *
 * A {@link RoutingHint} (tier, intent, explicit provider/model) resolves to a
 * concrete {@link Route} (provider id + model config). Today the default router
 * is a straightforward tier lookup, but because every request flows through this
 * interface, richer policies — cost-aware routing, intent→model maps, fallback
 * chains, A/B splits — slot in later without touching {@link AIService} or any
 * caller.
 */

import type { AIConfig, ModelConfig, ModelTier } from './AIConfig';
import type { ModelId } from './types';

export interface RoutingHint {
  readonly provider?: string;
  readonly tier?: ModelTier;
  readonly model?: ModelId;
  /** The intent behind the request — lets future routers specialize by task. */
  readonly intent?: string;
}

export interface Route {
  readonly provider: string;
  readonly model: ModelConfig;
}

export interface ModelRouter {
  route(hint: RoutingHint): Route;
}

/** The default tier-based router. */
export class DefaultModelRouter implements ModelRouter {
  constructor(private readonly config: AIConfig) {}

  route(hint: RoutingHint = {}): Route {
    const tier: ModelTier = hint.tier ?? 'default';
    const base = this.config.models[tier];
    return {
      provider: hint.provider ?? this.config.provider,
      // An explicit model id overrides the tier's model but keeps its sampling defaults.
      model: hint.model ? { ...base, model: hint.model } : base,
    };
  }
}
