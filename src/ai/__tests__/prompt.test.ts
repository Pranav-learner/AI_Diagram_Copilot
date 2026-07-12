import { describe, it, expect } from 'vitest';
import { PromptBuilder, PromptRegistry, BASE_SYSTEM_PROMPT } from '../planning/PromptBuilder';
import type { PromptTemplate } from '../planning/PromptBuilder';

const template: PromptTemplate = {
  id: 'test.capability',
  version: 'v1',
  system: `${BASE_SYSTEM_PROMPT}\nGreet {{name}}.`,
  developer: 'Always answer as JSON.',
  fewShot: [{ user: 'hi', assistant: '{"ok":true}' }],
};

describe('PromptRegistry', () => {
  it('resolves latest version by default and specific versions on request', () => {
    const registry = new PromptRegistry().register(template).register({ ...template, version: 'v2', system: 'newer' });
    expect(registry.get('test.capability').version).toBe('v2');
    expect(registry.get('test.capability', 'v1').system).toContain('Greet');
    expect([...registry.versions('test.capability')].sort()).toEqual(['v1', 'v2']);
  });

  it('throws on an unknown template', () => {
    expect(() => new PromptRegistry().get('missing')).toThrow(/No prompt template/);
  });
});

describe('PromptBuilder', () => {
  it('assembles messages in the contract order and interpolates variables', () => {
    const builder = new PromptBuilder({ registry: new PromptRegistry().register(template) });
    const messages = builder.build({
      template: { id: 'test.capability' },
      user: 'Do the thing',
      variables: { name: 'Ada' },
      contextBlock: '```json\n{"nodes":1}\n```',
      conversation: [{ role: 'assistant', content: 'earlier' }],
    });

    expect(messages.map((m) => m.role)).toEqual([
      'system',
      'developer', // template developer
      'user', // few-shot user
      'assistant', // few-shot assistant
      'assistant', // conversation
      'developer', // injected context
      'user', // new turn
    ]);
    expect(messages[0]!.content).toContain('Greet Ada.');
    expect(messages.at(-2)!.content).toContain('Current diagram context');
    expect(messages.at(-1)!.content).toBe('Do the thing');
  });

  it('accepts an inline template object', () => {
    const messages = new PromptBuilder().build({ template, user: 'x' });
    expect(messages[0]!.role).toBe('system');
  });
});
