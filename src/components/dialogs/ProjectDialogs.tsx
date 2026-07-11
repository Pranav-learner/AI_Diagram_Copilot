import { CreateProjectDialog } from './CreateProjectDialog';
import { RenameProjectDialog } from './RenameProjectDialog';
import { DeleteProjectDialog } from './DeleteProjectDialog';

/**
 * Mounts all project dialogs once. Each reads its own open state from the
 * project store, so only the active one renders. Placed at the dashboard root
 * so any card/menu can open a dialog without prop drilling.
 */
export function ProjectDialogs() {
  return (
    <>
      <CreateProjectDialog />
      <RenameProjectDialog />
      <DeleteProjectDialog />
    </>
  );
}
