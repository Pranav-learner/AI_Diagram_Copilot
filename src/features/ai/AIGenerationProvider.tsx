import { useEffect, useMemo, type ReactNode } from 'react';
import { DiagramGenerator, DiagramEditor, ExplainEngine, ReviewEngine, IntelligenceEngine, UnderstandingEngine, RuleBasedIntentAnalyzer } from '@/ai';
import { useDiagramRuntime, useDiagramBridge } from '@/features/canvas';
import { createRuntimeGateway } from '@/features/canvas/runtime/runtimeGateway';
import { createRuntimeContextSource, createRuntimeChangeSource } from './runtimeContextSource';
import { createEditorAIService } from './aiService';
import { AIGenerationContext } from './AIGenerationContext';
import { useAiSettingsStore, settingsToConfigOverride } from './store/useAiSettingsStore';

/**
 * Wires the AI copilot (generation + editing) to the live runtime. Builds one
 * AIService from the current AI settings, the runtime gateway, and the read-side
 * context source, then constructs a generator + editor sharing them. Rebuilds
 * when the relevant settings change. Must sit inside {@link DiagramRuntimeProvider}.
 */
export function AIGenerationProvider({ children }: { children: ReactNode }) {
  const runtime = useDiagramRuntime();
  const bridge = useDiagramBridge();

  // Subscribe to the settings that affect the service so it rebuilds on change.
  const provider = useAiSettingsStore((s) => s.provider);
  const model = useAiSettingsStore((s) => s.model);
  const temperature = useAiSettingsStore((s) => s.temperature);
  const maxTokens = useAiSettingsStore((s) => s.maxTokens);
  const streaming = useAiSettingsStore((s) => s.streaming);
  const promptVersion = useAiSettingsStore((s) => s.promptVersion);

  const value = useMemo(() => {
    const override = settingsToConfigOverride({
      provider,
      model,
      temperature,
      maxTokens,
      streaming,
      promptVersion,
      debug: false,
      set: () => {},
      reset: () => {},
    });
    const bundle = createEditorAIService(override);
    const gateway = createRuntimeGateway(runtime);
    const contextSource = createRuntimeContextSource(runtime, bridge);
    const generator = new DiagramGenerator({ service: bundle.service, gateway, stream: streaming });
    const editor = new DiagramEditor({ service: bundle.service, gateway, contextSource, stream: streaming });
    // Understanding Engine kept in sync with the runtime; Explain + Review read it.
    const understanding = UnderstandingEngine.attach(createRuntimeChangeSource(runtime));
    const explain = new ExplainEngine({ service: bundle.service, graphSource: understanding, stream: streaming });
    const review = new ReviewEngine({ service: bundle.service, graphSource: understanding, stream: streaming });
    // Proactive Intelligence Engine — watches the diagram and maintains the feed.
    const intelligence = new IntelligenceEngine({ service: bundle.service, graphSource: understanding, stream: streaming });
    const intentAnalyzer = new RuleBasedIntentAnalyzer();
    return {
      generator,
      editor,
      explain,
      review,
      intelligence,
      understanding,
      selectEntities: (ids: readonly string[]) => bridge.setSelection(ids),
      runtime,
      contextSource,
      intentAnalyzer,
      metrics: bundle.metrics,
      provider: bundle.providerId,
      model: bundle.model,
      usingMock: bundle.usingMock,
      availableProviders: bundle.availableProviders,
    };
  }, [runtime, bridge, provider, model, temperature, maxTokens, streaming, promptVersion]);

  // Release the previous engine subscriptions on rebuild.
  useEffect(() => {
    return () => {
      value.explain.dispose();
      value.review.dispose();
      value.intelligence.dispose();
      value.understanding.dispose();
    };
  }, [value]);

  return <AIGenerationContext.Provider value={value}>{children}</AIGenerationContext.Provider>;
}
