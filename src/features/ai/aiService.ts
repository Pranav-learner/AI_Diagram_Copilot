/**
 * Editor-side AI service assembly.
 *
 * Builds the {@link AIService} the generation UI uses. It prefers a real provider
 * when an API key is configured (Anthropic, then OpenAI) and always registers the
 * heuristic {@link MockPlanProvider} so the feature works with **zero
 * configuration** in dev/demo. This is the only place the app picks a provider —
 * everything downstream is provider-agnostic.
 *
 * Note: browser CORS blocks direct calls to some vendor APIs; a production
 * deployment routes real providers through a backend proxy (a `baseURL`
 * override). The abstraction makes that a config change, not a code change.
 */

import {
  AIService,
  AIMetrics,
  ProviderRegistry,
  AnthropicProvider,
  OpenAIProvider,
  MockPlanProvider,
  mergeConfig,
} from '@/ai';

export interface EditorAIBundle {
  readonly service: AIService;
  readonly metrics: AIMetrics;
  readonly providerId: string;
  /** True when no real key is configured and the heuristic mock is in use. */
  readonly usingMock: boolean;
}

export function createEditorAIService(): EditorAIBundle {
  const env = import.meta.env;
  const registry = new ProviderRegistry();
  registry.register(new MockPlanProvider());

  let providerId = 'mock-plan';
  let usingMock = true;

  if (env.VITE_ANTHROPIC_API_KEY) {
    registry.register(new AnthropicProvider({ apiKey: env.VITE_ANTHROPIC_API_KEY }));
    providerId = 'anthropic';
    usingMock = false;
  } else if (env.VITE_OPENAI_API_KEY) {
    registry.register(new OpenAIProvider({ apiKey: env.VITE_OPENAI_API_KEY }));
    providerId = 'openai';
    usingMock = false;
  }

  const metrics = new AIMetrics();
  const service = new AIService({ registry, config: mergeConfig({ provider: providerId }), metrics });
  return { service, metrics, providerId, usingMock };
}
