import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, FileQuestion, Loader2, RotateCcw } from 'lucide-react';
import { useAutosave, useDiagram, useProject } from '@/hooks';
import type { DiagramResponse, Project } from '@/types';
import { EditorLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Canvas,
  CanvasInspector,
  CanvasProvider,
  CanvasStatusBar,
  DiagramRuntimeProvider,
} from '@/features/canvas';

/** Dotted-canvas skeleton shown while project + diagram load. */
function CanvasLoading() {
  return (
    <div className="canvas-grid absolute inset-0 flex items-center justify-center bg-muted/30">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading diagram…
      </span>
    </div>
  );
}

/** Error state when the diagram fails to load (network/server). */
function CanvasError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Couldn't load this diagram</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          There was a problem reaching the server. Check your connection and try
          again.
        </p>
      </div>
      <Button onClick={onRetry} variant="outline">
        <RotateCcw />
        Retry
      </Button>
    </div>
  );
}

/** In-shell "not found" state that keeps navigation available. */
function DiagramNotFound({ projectId }: { projectId: string | undefined }) {
  return (
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
  );
}

/** Runs the autosave loop; renders nothing. Lives inside CanvasProvider. */
function AutosaveController({
  projectId,
  initialVersion,
}: {
  projectId: string;
  initialVersion: number;
}) {
  useAutosave({ projectId, initialVersion });
  return null;
}

/** The loaded editor: engine provider + canvas + panels + autosave. */
function EditorWorkspace({
  project,
  diagram,
}: {
  project: Project;
  diagram: DiagramResponse;
}) {
  return (
    <CanvasProvider>
      <DiagramRuntimeProvider data={diagram.data}>
        <EditorLayout
          project={project}
          isLoading={false}
          inspector={<CanvasInspector />}
          statusBar={<CanvasStatusBar />}
        >
          <AutosaveController
            projectId={project.id}
            initialVersion={diagram.version}
          />
          <Canvas />
        </EditorLayout>
      </DiagramRuntimeProvider>
    </CanvasProvider>
  );
}

/**
 * Editor route (`/editor/:projectId`). Loads project metadata and the diagram
 * scene, showing skeleton / not-found / error states, then mounts the workspace.
 * The workspace is keyed by project id so switching projects remounts the engine
 * with a fresh scene.
 */
export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const projectQuery = useProject(projectId);
  const diagramQuery = useDiagram(projectId);

  // Project resolved but absent → not found.
  if (projectQuery.data === null && !projectQuery.isLoading) {
    return (
      <EditorLayout project={null} isLoading={false}>
        <DiagramNotFound projectId={projectId} />
      </EditorLayout>
    );
  }

  // Diagram failed to load (network/server).
  if (diagramQuery.isError) {
    return (
      <EditorLayout project={projectQuery.data} isLoading={false}>
        <CanvasError onRetry={() => void diagramQuery.refetch()} />
      </EditorLayout>
    );
  }

  // Still loading metadata or scene.
  if (projectQuery.isLoading || diagramQuery.isLoading || !projectQuery.data || !diagramQuery.data) {
    return (
      <EditorLayout project={projectQuery.data} isLoading>
        <CanvasLoading />
      </EditorLayout>
    );
  }

  return (
    <EditorWorkspace
      key={projectQuery.data.id}
      project={projectQuery.data}
      diagram={diagramQuery.data}
    />
  );
}
