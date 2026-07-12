/**
 * Centralized AI configuration — the single home for every AI tunable.
 *
 * The module spec is explicit: "No magic constants." Model ids, temperatures,
 * token limits, retry policy, timeouts, streaming, prompt version, context
 * budget, and validation thresholds all live here, never scattered as literals
 * through the codebase. Config is plain immutable data so it can be persisted,
 * diffed, and overridden per environment/tenant via {@link mergeConfig}.
 *
 * Defaults target Anthropic Claude (the platform's primary provider) using the
 * latest model ids.
 */

import type { ModelId } from './types';

/** Exponential-backoff retry policy for transient failures. */
export interface RetryConfig {
  /** Attempts after the first (so `2` = up to 3 total tries). */
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  /** Multiplier applied to the delay after each failed attempt. */
  readonly backoffFactor: number;
  /** Add randomized jitter to spread retries and avoid thundering herds. */
  readonly jitter: boolean;
}

/** A named model tier: which model + how it should sample by default. */
export interface ModelConfig {
  readonly model: ModelId;
  readonly temperature: number;
  readonly maxTokens: number;
}

/**
 * Model tiers. Callers pick a *tier* (semantic role), not a model id, so the
 * mapping tier→model changes in one place. `reasoning` is the high-capability
 * tier for planning/generation; `fast` is the cheap tier for classification.
 */
export interface ModelTiers {
  readonly default: ModelConfig;
  readonly fast: ModelConfig;
  readonly reasoning: ModelConfig;
}

export type ModelTier = keyof ModelTiers;

export interface ValidationConfig {
  /** Reject structured responses whose self-reported confidence is below this. */
  readonly minConfidence: number;
  /** Reject unknown object keys in structured output (strict schema parsing). */
  readonly rejectUnknownKeys: boolean;
}

export interface AIConfig {
  /** Default provider id (must be registered in the ProviderRegistry). */
  readonly provider: string;
  readonly models: ModelTiers;
  readonly retry: RetryConfig;
  /** Per-attempt deadline in ms (0 disables). */
  readonly timeoutMs: number;
  /** Whether streaming is enabled by default. */
  readonly streaming: boolean;
  /** Active prompt template version (see PromptRegistry). */
  readonly promptVersion: string;
  /** Soft token budget the ContextBuilder targets when summarizing a diagram. */
  readonly contextTokenBudget: number;
  readonly validation: ValidationConfig;
}

/** The shipped default configuration. Frozen so it can be shared safely. */
export const defaultAIConfig: AIConfig = Object.freeze({
  provider: 'anthropic',
  models: Object.freeze({
    default: { model: 'claude-opus-4-8', temperature: 0.2, maxTokens: 4096 },
    fast: { model: 'claude-haiku-4-5-20251001', temperature: 0, maxTokens: 1024 },
    reasoning: { model: 'claude-opus-4-8', temperature: 0.1, maxTokens: 8192 },
  }),
  retry: Object.freeze({
    maxRetries: 2,
    initialDelayMs: 400,
    maxDelayMs: 8000,
    backoffFactor: 2,
    jitter: true,
  }),
  timeoutMs: 60_000,
  streaming: false,
  promptVersion: 'v1',
  contextTokenBudget: 8_000,
  validation: Object.freeze({ minConfidence: 0.3, rejectUnknownKeys: false }),
}) as AIConfig;

/** A partial override, applied one level deep over the nested config groups. */
export interface AIConfigOverride {
  readonly provider?: string;
  readonly models?: Partial<ModelTiers>;
  readonly retry?: Partial<RetryConfig>;
  readonly timeoutMs?: number;
  readonly streaming?: boolean;
  readonly promptVersion?: string;
  readonly contextTokenBudget?: number;
  readonly validation?: Partial<ValidationConfig>;
}

/**
 * Merge an override onto a base config (defaults to {@link defaultAIConfig}).
 * Nested groups are shallow-merged so callers can override a single field
 * (e.g. just `retry.maxRetries`) without restating the rest.
 */
export function mergeConfig(override: AIConfigOverride = {}, base: AIConfig = defaultAIConfig): AIConfig {
  return {
    provider: override.provider ?? base.provider,
    models: {
      default: { ...base.models.default, ...override.models?.default },
      fast: { ...base.models.fast, ...override.models?.fast },
      reasoning: { ...base.models.reasoning, ...override.models?.reasoning },
    },
    retry: { ...base.retry, ...override.retry },
    timeoutMs: override.timeoutMs ?? base.timeoutMs,
    streaming: override.streaming ?? base.streaming,
    promptVersion: override.promptVersion ?? base.promptVersion,
    contextTokenBudget: override.contextTokenBudget ?? base.contextTokenBudget,
    validation: { ...base.validation, ...override.validation },
  };
}
