import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIConfigOverride } from '@/ai';
import { defaultAIConfig } from '@/ai';

/**
 * User-configurable AI settings (persisted). These drive the AIService config —
 * the experience layer owns the *preferences*; the AI foundation owns the
 * behaviour. `provider: 'auto'` defers to whatever credentials are configured
 * (real key, else the demo mock).
 */
export interface AiSettingsState {
  provider: string;
  /** Empty = use the tier default model. */
  model: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  promptVersion: string;
  /** Debug mode reveals raw model output + technical error details. */
  debug: boolean;

  set: (partial: Partial<Omit<AiSettingsState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const DEFAULTS = {
  provider: 'auto',
  model: '',
  temperature: 0.2,
  maxTokens: 4096,
  streaming: true,
  promptVersion: 'v1',
  debug: false,
} as const;

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (partial) => set(partial),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: 'adc-ai-settings' },
  ),
);

/** Translate the persisted settings into an {@link AIConfigOverride} for the service. */
export function settingsToConfigOverride(s: AiSettingsState): AIConfigOverride {
  // Full ModelConfigs (the override type requires a model); an empty setting
  // keeps the shipped default model for that tier.
  const tiers = defaultAIConfig.models;
  const override: AIConfigOverride = {
    streaming: s.streaming,
    promptVersion: s.promptVersion,
    models: {
      default: { model: s.model || tiers.default.model, temperature: s.temperature, maxTokens: s.maxTokens },
      reasoning: { model: s.model || tiers.reasoning.model, temperature: s.temperature, maxTokens: s.maxTokens },
    },
  };
  return s.provider && s.provider !== 'auto' ? { ...override, provider: s.provider } : override;
}
