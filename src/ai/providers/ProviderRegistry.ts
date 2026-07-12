/**
 * The provider registry — the lookup table that makes providers pluggable.
 *
 * {@link AIService} resolves a provider by id from here; nothing else knows a
 * concrete provider class. Registering a new vendor is a one-line `register`
 * call with no change to the service, client, or any caller — the abstraction's
 * whole point. Mirrors the engine's `RendererRegistry` pattern for consistency.
 */

import type { AIProvider } from '../core/AIProvider';
import { ProviderNotFoundError } from '../core/AIError';

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  /** Register (or replace) a provider under its id. Chainable. */
  register(provider: AIProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  /** Resolve a provider or throw {@link ProviderNotFoundError}. */
  get(id: string): AIProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new ProviderNotFoundError(id);
    return provider;
  }

  ids(): readonly string[] {
    return [...this.providers.keys()];
  }
}
