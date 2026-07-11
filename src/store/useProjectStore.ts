import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  FilterOption,
  Project,
  ProjectDialog,
  SortOption,
  ViewMode,
} from '@/types';

/**
 * Client-side state for *interacting* with the project collection: how it is
 * viewed (grid/list), queried (search/sort/filter), and which project dialog is
 * active. The project *data* itself lives in the TanStack Query cache
 * (see `hooks/useProjects`) — this store deliberately holds no server data.
 */
interface ProjectState {
  // View & query controls
  viewMode: ViewMode;
  searchQuery: string;
  sortOption: SortOption;
  filterOption: FilterOption;

  // Dialog orchestration
  activeDialog: ProjectDialog;
  /** The project a rename/delete dialog is acting on. */
  targetProject: Project | null;

  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setSortOption: (sort: SortOption) => void;
  setFilterOption: (filter: FilterOption) => void;

  openCreateDialog: () => void;
  openRenameDialog: (project: Project) => void;
  openDeleteDialog: (project: Project) => void;
  closeDialog: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      viewMode: 'grid',
      searchQuery: '',
      sortOption: 'recent',
      filterOption: 'all',

      activeDialog: null,
      targetProject: null,

      setViewMode: (viewMode) => set({ viewMode }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSortOption: (sortOption) => set({ sortOption }),
      setFilterOption: (filterOption) => set({ filterOption }),

      openCreateDialog: () =>
        set({ activeDialog: 'create', targetProject: null }),
      openRenameDialog: (project) =>
        set({ activeDialog: 'rename', targetProject: project }),
      openDeleteDialog: (project) =>
        set({ activeDialog: 'delete', targetProject: project }),
      closeDialog: () => set({ activeDialog: null, targetProject: null }),
    }),
    {
      name: 'adc-project-view',
      // Persist only durable view preferences, never transient dialog state.
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortOption: state.sortOption,
        filterOption: state.filterOption,
      }),
    },
  ),
);
