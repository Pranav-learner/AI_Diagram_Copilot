import { createContext } from 'react';
import type { DiagramGenerator, DiagramEditor, ExplainEngine, UnderstandingEngine, DiagramContextSource, IntentAnalyzer, AIMetrics } from '@/ai';
import type { DiagramRuntime } from '@/diagram-engine';

/**
 * Context for the AI copilot: the generator + editor wired to the live runtime,
 * the read-side context source (document + selection), an intent analyzer for
 * routing, the metrics sink (observability), and the effective provider/model.
 * Rebuilt when AI settings change.
 */
export interface AIGenerationContextValue {
  readonly generator: DiagramGenerator;
  readonly editor: DiagramEditor;
  /** Explain Mode orchestrator (reads the Semantic Graph, never the DSL). */
  readonly explain: ExplainEngine;
  /** The Understanding Engine kept in sync with the live diagram. */
  readonly understanding: UnderstandingEngine;
  readonly runtime: DiagramRuntime;
  readonly contextSource: DiagramContextSource;
  readonly intentAnalyzer: IntentAnalyzer;
  readonly metrics: AIMetrics;
  readonly provider: string;
  readonly model: string;
  readonly usingMock: boolean;
  readonly availableProviders: readonly string[];
}

export const AIGenerationContext = createContext<AIGenerationContextValue | null>(null);
