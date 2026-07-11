import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useUpdateProject } from '@/hooks';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_TITLE = 80;

/** Dialog for renaming an existing project. */
export function RenameProjectDialog() {
  const open = useProjectStore((s) => s.activeDialog === 'rename');
  const project = useProjectStore((s) => s.targetProject);
  const closeDialog = useProjectStore((s) => s.closeDialog);
  const updateProject = useUpdateProject();

  const [title, setTitle] = useState('');

  // Seed the field whenever a new target project opens the dialog.
  useEffect(() => {
    if (open && project) setTitle(project.title);
  }, [open, project]);

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      closeDialog();
      updateProject.reset();
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!project || !trimmed || updateProject.isPending) return;
    if (trimmed === project.title) {
      handleOpenChange(false);
      return;
    }

    updateProject.mutate(
      { id: project.id, input: { title: trimmed } },
      { onSuccess: () => handleOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename diagram</DialogTitle>
            <DialogDescription>
              Enter a new name for “{project?.title}”.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-5">
            <Label htmlFor="rename-title">Title</Label>
            <Input
              id="rename-title"
              value={title}
              autoFocus
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || updateProject.isPending}
            >
              {updateProject.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
