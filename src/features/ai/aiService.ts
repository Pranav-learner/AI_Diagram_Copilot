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
  MockEditProvider,
  MockExplainProvider,
  MockReviewProvider,
  MockInsightProvider,
  MockProjectIntelligenceProvider,
  mergeConfig,
} from '@/ai';
import type { AIProvider, ProviderCapabilities, ChatResponse, ResolvedRequest, StreamChunk, AIConfigOverride } from '@/ai';

/**
 * A single mock provider that serves ALL capabilities without a key: it inspects
 * the system prompt and routes to the plan mock (generation), the edit mock
 * (editing), or the explain mock (Explain Mode). This mirrors a real provider —
 * one endpoint, JSON shaped by the prompt — so the rest of the app is identical
 * with or without credentials.
 */
class MockAssistantProvider implements AIProvider {
  readonly id = 'mock-assistant';
  readonly capabilities: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 100_000 };
  private readonly plan = new MockPlanProvider();
  private readonly edit = new MockEditProvider();
  private readonly explain = new MockExplainProvider();
  private readonly review = new MockReviewProvider();
  private readonly insight = new MockInsightProvider();
  private readonly projectIntelligence = new MockProjectIntelligenceProvider();

  complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    return this.pick(request).complete(request, signal);
  }
  stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    return this.pick(request).stream(request, signal);
  }
  private pick(request: ResolvedRequest): AIProvider {
    const system = request.messages.find((m) => m.role === 'system')?.content ?? '';
    if (/Project Intelligence/.test(system)) return this.projectIntelligence;
    if (/Intelligence Engine/.test(system)) return this.insight;
    if (/Diagram Review/.test(system)) return this.review;
    if (/Explain Mode/.test(system)) return this.explain;
    if (/EditPlan/.test(system)) return this.edit;
    return this.plan;
  }
}

export interface EditorAIBundle {
  readonly service: AIService;
  readonly metrics: AIMetrics;
  readonly providerId: string;
  /** The effective model for the primary (reasoning) tier. */
  readonly model: string;
  /** True when no real key is configured and the heuristic mock is in use. */
  readonly usingMock: boolean;
  /** Provider ids available to choose from in settings. */
  readonly availableProviders: readonly string[];
}

/**
 * Build the editor AIService from optional settings overrides. Registers the
 * demo mock plus any key-configured real providers, honours a requested provider
 * when available (else falls back), and applies model/temperature/streaming
 * overrides. The one place the app selects a provider.
 */
export function createEditorAIService(override: AIConfigOverride = {}): EditorAIBundle {
  const env = import.meta.env;
  const registry = new ProviderRegistry();
  registry.register(new MockAssistantProvider());

  let autoProvider = 'mock-assistant';
  if (env.VITE_ANTHROPIC_API_KEY) {
    registry.register(new AnthropicProvider({ apiKey: env.VITE_ANTHROPIC_API_KEY }));
    autoProvider = 'anthropic';
  } else if (env.VITE_OPENAI_API_KEY) {
    registry.register(new OpenAIProvider({ apiKey: env.VITE_OPENAI_API_KEY }));
    autoProvider = 'openai';
  }

  // Honour a requested provider only when it is actually registered.
  const providerId = override.provider && registry.has(override.provider) ? override.provider : autoProvider;
  const config = mergeConfig({ ...override, provider: providerId });

  const metrics = new AIMetrics();
  const service = new AIService({ registry, config, metrics });
  return {
    service,
    metrics,
    providerId,
    model: config.models.reasoning.model,
    usingMock: providerId === 'mock-assistant',
    availableProviders: registry.ids(),
  };
}
