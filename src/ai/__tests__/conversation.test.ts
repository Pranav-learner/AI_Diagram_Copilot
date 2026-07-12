import { describe, it, expect } from 'vitest';
import { ConversationManager } from '../conversation/ConversationManager';
import type { Summarizer } from '../conversation/ConversationManager';
import { MockProvider } from '../providers/MockProvider';

function manager(extra: Partial<ConstructorParameters<typeof ConversationManager>[0]> = {}) {
  let t = 0;
  return new ConversationManager({ now: () => ++t, ...extra });
}

describe('ConversationManager', () => {
  it('creates conversations with ids and appends history', () => {
    const cm = manager();
    const conv = cm.create();
    cm.appendText(conv.id, 'user', 'hello');
    cm.appendText(conv.id, 'assistant', 'hi');
    const stored = cm.get(conv.id)!;
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[0]!.id).toBeDefined();
    expect(stored.updatedAt).toBeGreaterThan(stored.createdAt);
  });

  it('windows to the most recent messages within a token budget', () => {
    const cm = manager();
    const conv = cm.create();
    for (let i = 0; i < 10; i++) cm.appendText(conv.id, 'user', 'x'.repeat(40)); // ~10 tokens each
    const windowed = cm.window(conv.id, 30);
    // Budget admits only the most recent couple of messages, in order.
    expect(windowed.length).toBeGreaterThan(0);
    expect(windowed.length).toBeLessThan(10);
  });

  it('always keeps at least one message even when it exceeds the budget', () => {
    const cm = manager();
    const conv = cm.create();
    cm.appendText(conv.id, 'user', 'x'.repeat(400));
    expect(cm.window(conv.id, 1)).toHaveLength(1);
  });

  it('compacts old messages via the summarizer hook and prepends the summary', async () => {
    const summarizer: Summarizer = { summarize: async () => 'SUMMARY' };
    const cm = manager({ summarizer });
    const conv = cm.create();
    for (let i = 0; i < 10; i++) cm.appendText(conv.id, 'user', `m${i}`);
    const compacted = await cm.compact(conv.id, 3);
    expect(compacted.summary).toBe('SUMMARY');
    expect(compacted.messages).toHaveLength(3);
    expect(cm.window(conv.id)[0]!.content).toContain('SUMMARY');
  });

  it('is a no-op compaction without a summarizer', async () => {
    const cm = manager();
    const conv = cm.create();
    for (let i = 0; i < 10; i++) cm.appendText(conv.id, 'user', `m${i}`);
    const result = await cm.compact(conv.id, 3);
    expect(result.messages).toHaveLength(10);
    expect(result.summary).toBeUndefined();
  });

  it('records a streamed assistant reply into history while passing chunks through', async () => {
    const cm = manager();
    const conv = cm.create();
    const provider = new MockProvider({ replies: ['streamed answer'], chunkSize: 5 });
    let seen = '';
    for await (const chunk of cm.recordStream(conv.id, provider.stream({ model: 'm', messages: [] }))) {
      seen += chunk.delta;
    }
    expect(seen).toBe('streamed answer');
    const last = cm.get(conv.id)!.messages.at(-1)!;
    expect(last.role).toBe('assistant');
    expect(last.content).toBe('streamed answer');
  });
});
