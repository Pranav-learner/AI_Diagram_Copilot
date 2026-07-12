/**
 * Token accounting, broken down by model.
 *
 * Aggregates {@link TokenUsage} across requests so the platform can report and
 * (later) cost usage. Cost tracking is intentionally deferred — the spec lists
 * it as "future" — but the per-model breakdown is exactly the shape a cost
 * table will consume, so no rework is needed to add it.
 */

import type { ModelId, TokenUsage } from '../core/types';
import { ZERO_USAGE, addUsage } from '../core/types';

export class TokenTracker {
  private total: TokenUsage = ZERO_USAGE;
  private readonly byModel = new Map<ModelId, TokenUsage>();

  /** Add one usage record, attributed to `model`. */
  record(model: ModelId, usage: TokenUsage): void {
    this.total = addUsage(this.total, usage);
    this.byModel.set(model, addUsage(this.byModel.get(model) ?? ZERO_USAGE, usage));
  }

  get totals(): TokenUsage {
    return this.total;
  }

  forModel(model: ModelId): TokenUsage {
    return this.byModel.get(model) ?? ZERO_USAGE;
  }

  /** A snapshot of per-model usage. */
  breakdown(): Readonly<Record<ModelId, TokenUsage>> {
    return Object.fromEntries(this.byModel);
  }

  reset(): void {
    this.total = ZERO_USAGE;
    this.byModel.clear();
  }
}
