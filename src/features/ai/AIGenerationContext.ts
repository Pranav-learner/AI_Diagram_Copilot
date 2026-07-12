import { createContext } from 'react';
import type { DiagramGenerator } from '@/ai';
import type { DiagramRuntime } from '@/diagram-engine';

/**
 * Context for the diagram-generation feature: a ready {@link DiagramGenerator}
 * wired to the live runtime (via the gateway), plus the runtime itself (used by
 * regenerate to remove the prior generation) and whether a mock provider is in
 * use (for a "demo mode" hint).
 */
export interface AIGenerationContextValue {
  readonly generator: DiagramGenerator;
  readonly runtime: DiagramRuntime;
  readonly usingMock: boolean;
}

export const AIGenerationContext = createContext<AIGenerationContextValue | null>(null);
