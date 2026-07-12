/**
 * Convenience wiring for the common case.
 *
 * Assembling the foundation by hand (registry + providers + config + metrics +
 * service) is a few lines; {@link createAIService} does it once, correctly. It
 * registers whichever real providers have credentials, always keeps a
 * {@link MockProvider} as a safety net, and falls back to `mock` when the
 * configured provider is unavailable — so the platform boots in dev/tests with
 * zero keys, and lights up real providers by adding config alone.
 */

import type { AIProvider } from './AIProvider';
import type { AIConfig, AIConfigOverride } from './AIConfig';
import { mergeConfig } from './AIConfig';
import { AIService } from './AIService';
import type { AIServiceDeps } from './AIService';
import type { Logger } from '../observability/Logger';
import { AIMetrics } from '../observability/AIMetrics';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { MockProvider } from '../providers/MockProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { GeminiProvider } from '../providers/GeminiProvider';

export interface CreateAIServiceOptions {
  readonly config?: AIConfigOverride;
  /** Explicit providers (bypasses key-based auto-registration). */
  readonly providers?: readonly AIProvider[];
  readonly anthropicApiKey?: string;
  readonly openAIApiKey?: string;
  readonly geminiApiKey?: string;
  readonly metrics?: AIMetrics;
  readonly logger?: Logger;
  /** Test/DI escape hatches forwarded to {@link AIService}. */
  readonly serviceOverrides?: Partial<Pick<AIServiceDeps, 'now' | 'sleep' | 'random' | 'router'>>;
}

export interface AIServiceBundle {
  readonly service: AIService;
  readonly registry: ProviderRegistry;
  readonly metrics: AIMetrics;
  readonly config: AIConfig;
}

export function createAIService(options: CreateAIServiceOptions = {}): AIServiceBundle {
  const config = mergeConfig(options.config);
  const registry = new ProviderRegistry();

  for (const provider of options.providers ?? autoProviders(options)) registry.register(provider);
  if (!registry.has('mock')) registry.register(new MockProvider());

  // Fall back to the mock provider if the configured one has no credentials.
  const effectiveConfig: AIConfig = registry.has(config.provider) ? config : { ...config, provider: 'mock' };

  const metrics = options.metrics ?? new AIMetrics();
  const service = new AIService({
    registry,
    config: effectiveConfig,
    metrics,
    logger: options.logger,
    ...options.serviceOverrides,
  });
  return { service, registry, metrics, config: effectiveConfig };
}

/** Build providers for whichever credentials are present. */
function autoProviders(options: CreateAIServiceOptions): AIProvider[] {
  const providers: AIProvider[] = [];
  if (options.anthropicApiKey) providers.push(new AnthropicProvider({ apiKey: options.anthropicApiKey }));
  if (options.openAIApiKey) providers.push(new OpenAIProvider({ apiKey: options.openAIApiKey }));
  if (options.geminiApiKey) providers.push(new GeminiProvider({ apiKey: options.geminiApiKey }));
  return providers;
}
