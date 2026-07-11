import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCreateProject } from '@/hooks';
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
import { Textarea } from '@/components/ui/textarea';

const MAX_TITLE = 80;

/** Dialog for creating a new diagram; navigates to the editor on success. */
export function CreateProjectDialog() {
  const open = useProjectStore((s) => s.activeDialog === 'create');
  const closeDialog = useProjectStore((s) => s.closeDialog);
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const reset = (): void => {
    setTitle('');
    setDescription('');
    createProject.reset();
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      closeDialog();
      reset();
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || createProject.isPending) return;

    createProject.mutate(
      { title: trimmed, description: description.trim() },
      {
        onSuccess: (project) => {
          closeDialog();
          reset();
          navigate(`/editor/${project.id}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create new diagram</DialogTitle>
            <DialogDescription>
              Give your diagram a name to get started. You can change it later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5">
            <div className="grid gap-2">
              <Label htmlFor="create-title">Title</Label>
              <Input
                id="create-title"
                value={title}
                autoFocus
                maxLength={MAX_TITLE}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. System Architecture"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-description">
                Description{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="create-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this diagram about?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || createProject.isPending}>
              {createProject.isPending && <Loader2 className="animate-spin" />}
              Create diagram
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
