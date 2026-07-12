import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A persisted library of reusable prompts. Users reuse, duplicate, favorite,
 * search (UI-side filter), and delete prompts. Export is a future placeholder.
 * This is UX convenience state — not AI "memory" — hence local persistence.
 */
export interface SavedPrompt {
  readonly id: string;
  readonly text: string;
  readonly favorite: boolean;
  readonly createdAt: number;
}

export interface PromptLibraryState {
  prompts: SavedPrompt[];
  add: (text: string) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  duplicate: (id: string) => void;
  clear: () => void;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `prompt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set) => ({
      prompts: [],
      add: (text) =>
        set((state) => {
          const trimmed = text.trim();
          if (!trimmed || state.prompts.some((p) => p.text === trimmed)) return state;
          return { prompts: [{ id: newId(), text: trimmed, favorite: false, createdAt: Date.now() }, ...state.prompts] };
        }),
      remove: (id) => set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) })),
      toggleFavorite: (id) =>
        set((state) => ({ prompts: state.prompts.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)) })),
      duplicate: (id) =>
        set((state) => {
          const found = state.prompts.find((p) => p.id === id);
          if (!found) return state;
          return { prompts: [{ ...found, id: newId(), favorite: false, createdAt: Date.now() }, ...state.prompts] };
        }),
      clear: () => set({ prompts: [] }),
    }),
    { name: 'adc-ai-prompts' },
  ),
);

/** Filter + sort prompts for display: favorites first, then newest. */
export function filterPrompts(prompts: readonly SavedPrompt[], query: string): SavedPrompt[] {
  const q = query.trim().toLowerCase();
  const matched = q ? prompts.filter((p) => p.text.toLowerCase().includes(q)) : [...prompts];
  return matched.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt);
}
