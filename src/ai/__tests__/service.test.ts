import { describe, it, expect } from 'vitest';
import { AIService } from '../core/AIService';
import { createAIService } from '../core/factory';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { MockProvider } from '../providers/MockProvider';
import { AIMetrics } from '../observability/AIMetrics';
import { mergeConfig } from '../core/AIConfig';
import { NetworkError } from '../core/AIError';

function countingNow() {
  let t = 0;
  return () => {
    const v = t;
    t += 5;
    return v;
  };
}

describe('AIService', () => {
  it('routes tier → model and records success metrics', async () => {
    const provider = new MockProvider();
    const registry = new ProviderRegistry().register(provider);
    const metrics = new AIMetrics();
    const config = mergeConfig({ provider: 'mock', models: { fast: { model: 'fast-model', temperature: 0, maxTokens: 10 } } });
    const service = new AIService({ registry, config, metrics, now: countingNow() });

    await service.complete({ messages: [{ role: 'user', content: 'hi' }] }, { tier: 'fast' });

    expect(provider.calls[0]!.model).toBe('fast-model');
    const snap = metrics.snapshot();
    expect(snap.requests).toBe(1);
    expect(snap.successes).toBe(1);
    expect(snap.latency.avgMs).toBe(5);
    expect(snap.byModel['fast-model']).toBe(1);
  });

  it('applies model sampling defaults but lets the request override them', async () => {
    const provider = new MockProvider();
    const registry = new ProviderRegistry().register(provider);
    const config = mergeConfig({ provider: 'mock', models: { default: { model: 'd', temperature: 0.9, maxTokens: 100 } } });
    const service = new AIService({ registry, config });
    await service.complete({ messages: [{ role: 'user', content: 'x' }], temperature: 0.1 });
    expect(provider.calls[0]!.temperature).toBe(0.1);
    expect(provider.calls[0]!.maxTokens).toBe(100);
  });

  it('records failure metrics and rethrows', async () => {
    const provider = new MockProvider({ failure: () => new NetworkError('down') });
    const registry = new ProviderRegistry().register(provider);
    const metrics = new AIMetrics();
    const service = new AIService({ registry, config: mergeConfig({ provider: 'mock', retry: { maxRetries: 0 } }), metrics });
    await expect(service.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(NetworkError);
    const snap = metrics.snapshot();
    expect(snap.failures).toBe(1);
    expect(snap.errorsByType['NetworkError']).toBe(1);
  });
});

describe('createAIService', () => {
  it('boots with zero keys, falling back to the mock provider', async () => {
    const { service, config, registry } = createAIService();
    expect(config.provider).toBe('mock');
    expect(registry.has('mock')).toBe(true);
    const res = await service.complete({ messages: [{ role: 'user', content: 'ping' }] });
    expect(res.text).toBe('ping');
  });

  it('registers real providers when keys are present', () => {
    const { registry } = createAIService({ anthropicApiKey: 'k' });
    expect(registry.has('anthropic')).toBe(true);
    expect(registry.has('mock')).toBe(true);
  });
});
