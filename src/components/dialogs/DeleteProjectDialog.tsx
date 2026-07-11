import { Loader2 } from 'lucide-react';
import { useDeleteProject } from '@/hooks';
import { useProjectStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Confirmation dialog for deleting a project. Destructive, irreversible copy. */
export function DeleteProjectDialog() {
  const open = useProjectStore((s) => s.activeDialog === 'delete');
  const project = useProjectStore((s) => s.targetProject);
  const closeDialog = useProjectStore((s) => s.closeDialog);
  const deleteProject = useDeleteProject();

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      closeDialog();
      deleteProject.reset();
    }
  };

  const handleDelete = (): void => {
    if (!project || deleteProject.isPending) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => handleOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete diagram</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">
              “{project?.title}”
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteProject.isPending}
          >
            {deleteProject.isPending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
