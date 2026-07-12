import { create } from 'zustand';
import type { AiTurn, TimelineStage } from '../types';

/**
 * The live copilot conversation — a session-only list of {@link AiTurn}s. It is
 * a dumb container: the {@link useAiCopilot} hook builds turns (with ids +
 * timestamps) and the runtime/generator/editor feed updates in. Not persisted
 * (the module excludes long-term memory).
 */
export interface AiConversationState {
  turns: AiTurn[];
  addTurn: (turn: AiTurn) => void;
  patchTurn: (id: string, partial: Partial<AiTurn>) => void;
  upsertStage: (id: string, stage: TimelineStage) => void;
  appendToken: (id: string, delta: string) => void;
  removeTurn: (id: string) => void;
  clear: () => void;
}

export const useAiConversationStore = create<AiConversationState>((set) => ({
  turns: [],
  addTurn: (turn) => set((state) => ({ turns: [...state.turns, turn] })),
  patchTurn: (id, partial) =>
    set((state) => ({ turns: state.turns.map((t) => (t.id === id ? { ...t, ...partial } : t)) })),
  upsertStage: (id, stage) =>
    set((state) => ({
      turns: state.turns.map((t) => {
        if (t.id !== id) return t;
        const existing = t.stages.findIndex((s) => s.key === stage.key);
        const stages = existing >= 0 ? t.stages.map((s, i) => (i === existing ? stage : s)) : [...t.stages, stage];
        return { ...t, stages };
      }),
    })),
  appendToken: (id, delta) =>
    set((state) => ({ turns: state.turns.map((t) => (t.id === id ? { ...t, streamingText: t.streamingText + delta } : t)) })),
  removeTurn: (id) => set((state) => ({ turns: state.turns.filter((t) => t.id !== id) })),
  clear: () => set({ turns: [] }),
}));
