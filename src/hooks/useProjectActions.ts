import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDuplicateProject } from './useProjects';
import { useProjectStore } from '@/store';
import type { Project } from '@/types';

export interface ProjectActions {
  open: (project: Project) => void;
  rename: (project: Project) => void;
  duplicate: (project: Project) => void;
  remove: (project: Project) => void;
  /** Id of the project currently being duplicated, if any. */
  duplicatingId: string | null;
}

/**
 * Single source of truth for the actions exposed by a project's overflow menu.
 * Shared by the grid card and the list row so behavior stays identical.
 */
export function useProjectActions(): ProjectActions {
  const navigate = useNavigate();
  const openRenameDialog = useProjectStore((s) => s.openRenameDialog);
  const openDeleteDialog = useProjectStore((s) => s.openDeleteDialog);
  const duplicateProject = useDuplicateProject();

  const open = useCallback(
    (project: Project) => navigate(`/editor/${project.id}`),
    [navigate],
  );

  const duplicate = useCallback(
    (project: Project) => {
      if (duplicateProject.isPending) return;
      duplicateProject.mutate(project.id);
    },
    [duplicateProject],
  );

  return useMemo(
    () => ({
      open,
      rename: openRenameDialog,
      duplicate,
      remove: openDeleteDialog,
      duplicatingId: duplicateProject.isPending
        ? (duplicateProject.variables ?? null)
        : null,
    }),
    [open, openRenameDialog, duplicate, openDeleteDialog, duplicateProject],
  );
}
