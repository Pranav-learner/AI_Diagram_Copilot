import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Global, cross-cutting UI chrome state that is not specific to the project
 * collection or the editor canvas — e.g. sidebar collapse and the mobile
 * navigation drawer. Kept separate from `useProjectStore` and `useEditorStore`
 * so unrelated concerns don't share a store.
 */
interface UIState {
  /** Editor left sidebar collapsed (icon-only) on desktop. */
  sidebarCollapsed: boolean;
  /** Editor sidebar drawer open on mobile/tablet. */
  mobileSidebarOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
    }),
    {
      name: 'adc-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
