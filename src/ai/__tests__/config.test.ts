import { describe, it, expect } from 'vitest';
import { defaultAIConfig, mergeConfig } from '../core/AIConfig';

describe('AIConfig', () => {
  it('exposes frozen defaults targeting Anthropic', () => {
    expect(defaultAIConfig.provider).toBe('anthropic');
    expect(defaultAIConfig.models.default.model).toContain('claude');
    expect(Object.isFrozen(defaultAIConfig)).toBe(true);
  });

  it('shallow-merges nested groups without restating siblings', () => {
    const merged = mergeConfig({ retry: { maxRetries: 5 }, models: { fast: { model: 'x', temperature: 0, maxTokens: 10 } } });
    expect(merged.retry.maxRetries).toBe(5);
    // Untouched retry fields survive.
    expect(merged.retry.initialDelayMs).toBe(defaultAIConfig.retry.initialDelayMs);
    // Untouched tiers survive.
    expect(merged.models.default).toEqual(defaultAIConfig.models.default);
    expect(merged.models.fast.model).toBe('x');
  });

  it('does not mutate the base config', () => {
    mergeConfig({ provider: 'openai' });
    expect(defaultAIConfig.provider).toBe('anthropic');
  });
});
