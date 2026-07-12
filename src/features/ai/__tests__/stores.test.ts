import { describe, it, expect, beforeEach } from 'vitest';
import { useAiSettingsStore, settingsToConfigOverride } from '../store/useAiSettingsStore';
import { usePromptLibraryStore, filterPrompts } from '../store/usePromptLibraryStore';
import { useAiConversationStore } from '../store/useAiConversationStore';
import type { AiTurn } from '../types';

function turn(id: string, overrides: Partial<AiTurn> = {}): AiTurn {
  return {
    id,
    kind: 'generate',
    prompt: 'p',
    intent: 'generate',
    createdAt: 0,
    status: 'streaming',
    stages: [],
    streamingText: '',
    warnings: [],
    provider: 'mock',
    model: 'm',
    baseVersion: 1,
    ...overrides,
  };
}

describe('useAiSettingsStore', () => {
  beforeEach(() => useAiSettingsStore.getState().reset());

  it('translates settings to a config override (provider auto omitted)', () => {
    useAiSettingsStore.getState().set({ temperature: 0.7, streaming: false, provider: 'auto' });
    const override = settingsToConfigOverride(useAiSettingsStore.getState());
    expect(override.provider).toBeUndefined();
    expect(override.streaming).toBe(false);
    expect(override.models?.reasoning?.temperature).toBe(0.7);
  });

  it('includes an explicit provider when not auto', () => {
    useAiSettingsStore.getState().set({ provider: 'openai' });
    expect(settingsToConfigOverride(useAiSettingsStore.getState()).provider).toBe('openai');
  });
});

describe('usePromptLibraryStore', () => {
  beforeEach(() => usePromptLibraryStore.setState({ prompts: [] }));

  it('adds, de-dupes, favorites, duplicates, and removes', () => {
    const s = usePromptLibraryStore.getState();
    s.add('Design an architecture');
    s.add('Design an architecture'); // duplicate text — ignored
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(1);

    const id = usePromptLibraryStore.getState().prompts[0]!.id;
    s.toggleFavorite(id);
    expect(usePromptLibraryStore.getState().prompts[0]!.favorite).toBe(true);

    s.duplicate(id);
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(2);

    s.remove(id);
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(1);
  });

  it('filters + sorts favorites first', () => {
    const prompts = [
      { id: '1', text: 'flowchart of login', favorite: false, createdAt: 1 },
      { id: '2', text: 'architecture diagram', favorite: true, createdAt: 2 },
      { id: '3', text: 'a flow of data', favorite: false, createdAt: 3 },
    ];
    expect(filterPrompts(prompts, 'flow').map((p) => p.id)).toEqual(['3', '1']);
    expect(filterPrompts(prompts, '')[0]!.id).toBe('2'); // favorite first
  });
});

describe('useAiConversationStore', () => {
  beforeEach(() => useAiConversationStore.getState().clear());

  it('adds and patches turns', () => {
    const s = useAiConversationStore.getState();
    s.addTurn(turn('t1'));
    s.patchTurn('t1', { status: 'done' });
    expect(useAiConversationStore.getState().turns[0]!.status).toBe('done');
  });

  it('upserts stages by key and appends streamed tokens', () => {
    const s = useAiConversationStore.getState();
    s.addTurn(turn('t1'));
    s.upsertStage('t1', { key: 'plan', label: 'Plan', state: 'active' });
    s.upsertStage('t1', { key: 'plan', label: 'Plan', state: 'done' }); // update, not append
    s.appendToken('t1', 'he');
    s.appendToken('t1', 'llo');
    const t = useAiConversationStore.getState().turns[0]!;
    expect(t.stages).toHaveLength(1);
    expect(t.stages[0]!.state).toBe('done');
    expect(t.streamingText).toBe('hello');
  });

  it('clears the conversation', () => {
    const s = useAiConversationStore.getState();
    s.addTurn(turn('t1'));
    s.addTurn(turn('t2'));
    s.clear();
    expect(useAiConversationStore.getState().turns).toHaveLength(0);
  });
});
