import { describe, it, expect } from 'vitest';
import { RuleBasedIntentAnalyzer, LLMIntentAnalyzer } from '../planning/IntentAnalyzer';
import { AIService } from '../core/AIService';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { MockProvider } from '../providers/MockProvider';
import { mergeConfig } from '../core/AIConfig';

describe('RuleBasedIntentAnalyzer', () => {
  const analyzer = new RuleBasedIntentAnalyzer();

  it('classifies generation requests', () => {
    const c = analyzer.analyze({ text: 'Create a login flow diagram', hasDiagram: false });
    expect(c.intent).toBe('generate');
    expect(c.confidence).toBeGreaterThan(0.4);
  });

  it('classifies edits only when a diagram exists', () => {
    expect(analyzer.analyze({ text: 'add a cache node', hasDiagram: true }).intent).toBe('edit');
    // Without a diagram, an edit verb should not resolve to edit.
    expect(analyzer.analyze({ text: 'add a cache node', hasDiagram: false }).intent).not.toBe('edit');
  });

  it('classifies explain / review / import / export', () => {
    expect(analyzer.analyze({ text: 'explain this diagram', hasDiagram: true }).intent).toBe('explain');
    expect(analyzer.analyze({ text: 'review my architecture for issues', hasDiagram: true }).intent).toBe('review');
    expect(analyzer.analyze({ text: 'import from mermaid', hasDiagram: false }).intent).toBe('import');
    expect(analyzer.analyze({ text: 'export to png', hasDiagram: true }).intent).toBe('export');
  });

  it('defaults to generate on an empty canvas and unknown on a populated one', () => {
    expect(analyzer.analyze({ text: 'hmm', hasDiagram: false }).intent).toBe('generate');
    expect(analyzer.analyze({ text: 'hmm', hasDiagram: true }).intent).toBe('unknown');
  });
});

describe('LLMIntentAnalyzer', () => {
  function service(reply: string) {
    const registry = new ProviderRegistry().register(new MockProvider({ replies: [reply] }));
    return new AIService({ registry, config: mergeConfig({ provider: 'mock' }) });
  }

  it('uses the validated model classification', async () => {
    const analyzer = new LLMIntentAnalyzer({ service: service('{"intent":"review","confidence":0.8}') });
    const c = await analyzer.analyze({ text: 'anything' });
    expect(c.intent).toBe('review');
    expect(c.confidence).toBe(0.8);
  });

  it('falls back to rules when the model output is unusable', async () => {
    const analyzer = new LLMIntentAnalyzer({ service: service('not json') });
    const c = await analyzer.analyze({ text: 'create a diagram', hasDiagram: false });
    expect(c.intent).toBe('generate');
  });

  it('normalizes unknown intents to "unknown"', async () => {
    const analyzer = new LLMIntentAnalyzer({ service: service('{"intent":"teleport","confidence":0.9}') });
    expect((await analyzer.analyze({ text: 'x' })).intent).toBe('unknown');
  });
});
