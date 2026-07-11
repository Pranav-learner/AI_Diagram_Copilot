import { Link, useParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useProject } from '@/hooks';
import { EditorLayout } from '@/components/layout';
import { CanvasPlaceholder } from '@/components/editor';
import { Button } from '@/components/ui/button';

/**
 * Editor route (`/editor/:projectId`). Loads the project for chrome (title,
 * breadcrumb) and renders the canvas placeholder. A missing project id resolves
 * to an in-shell "not found" state rather than a hard 404, so navigation and
 * the sidebar stay available.
 */
export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading } = useProject(projectId);

  const notFound = !isLoading && project === null;

  return (
    <EditorLayout project={project} isLoading={isLoading}>
      {notFound ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileQuestion className="size-7" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Diagram not found</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              We couldn't find a diagram with the id{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {projectId}
              </code>
              . It may have been deleted.
            </p>
          </div>
          <Button asChild>
            <Link to="/">Back to dashboard</Link>
          </Button>
        </div>
      ) : (
        <CanvasPlaceholder />
      )}
    </EditorLayout>
  );
}
