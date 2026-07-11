import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Global, cross-cutting UI chrome state that is not specific to the project
 * collection or the editor canvas — e.g. sidebar/inspector collapse and the
 * mobile navigation drawer. Kept separate from `useProjectStore` and the canvas
 * store so unrelated concerns don't share a store.
 */
interface UIState {
  /** Editor left sidebar collapsed (icon-only) on desktop. */
  sidebarCollapsed: boolean;
  /** Editor right inspector collapsed on desktop. */
  inspectorCollapsed: boolean;
  /** Editor sidebar drawer open on mobile/tablet. */
  mobileSidebarOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleInspector: () => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      mobileSidebarOpen: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleInspector: () =>
        set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
      setInspectorCollapsed: (inspectorCollapsed) =>
        set({ inspectorCollapsed }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
    }),
    {
      name: 'adc-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        inspectorCollapsed: state.inspectorCollapsed,
      }),
    },
  ),
);
