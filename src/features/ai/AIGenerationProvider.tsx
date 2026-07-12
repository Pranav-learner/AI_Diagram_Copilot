import { useMemo, type ReactNode } from 'react';
import { DiagramGenerator } from '@/ai';
import { useDiagramRuntime } from '@/features/canvas';
import { createRuntimeGateway } from '@/features/canvas/runtime/runtimeGateway';
import { createEditorAIService } from './aiService';
import { AIGenerationContext } from './AIGenerationContext';

/**
 * Wires the AI generation stack to the live runtime. Builds the AIService (real
 * provider if configured, else the demo mock), adapts the runtime to the AI
 * layer's {@link DiagramGateway} port, and constructs one {@link DiagramGenerator}
 * for this editor session. Must sit inside {@link DiagramRuntimeProvider}.
 */
export function AIGenerationProvider({ children }: { children: ReactNode }) {
  const runtime = useDiagramRuntime();

  const value = useMemo(() => {
    const { service, usingMock } = createEditorAIService();
    const gateway = createRuntimeGateway(runtime);
    const generator = new DiagramGenerator({ service, gateway });
    return { generator, runtime, usingMock };
  }, [runtime]);

  return <AIGenerationContext.Provider value={value}>{children}</AIGenerationContext.Provider>;
}
