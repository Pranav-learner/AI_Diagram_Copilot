import { useContext, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, FileQuestion, Loader2, RotateCcw } from 'lucide-react';
import { useAutosave, useDiagram, useProject } from '@/hooks';
import type { DiagramResponse, Project } from '@/types';
import { projectService } from '@/services';
import { EditorLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Canvas,
  CanvasInspector,
  CanvasProvider,
  CanvasStatusBar,
  DiagramRuntimeProvider,
  useCanvas,
  useCanvasReady,
} from '@/features/canvas';
import { AIGenerationProvider, AIGenerationContext, AiSidebar, SoftwareIntelligenceWorkspace, useProjectIntelligenceStore } from '@/features/ai';
import { useUIStore } from '@/store';

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
          There was a problem reaching the server or this diagram ID is invalid.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onRetry} variant="outline">
          <RotateCcw />
          Retry
        </Button>
        <Button asChild>
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </div>
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

/** Renders the AI copilot sidebar when toggled on. */
function AiSidebarSlot() {
  const open = useUIStore((s) => s.aiSidebarOpen);
  return open ? <AiSidebar /> : null;
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

/** Automatically fits content when switching back to canvas tab */
function ActiveTabController() {
  const activeTab = useProjectIntelligenceStore((s) => s.activeTab);
  const adapter = useCanvas();

  useEffect(() => {
    if (activeTab !== 'canvas') {
      return undefined;
    }
    const timer = setTimeout(() => {
      try {
        adapter.fitToScreen();
      } catch {
        // ignore
      }
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [activeTab, adapter]);

  return null;
}

/** Ingests and renders any pending diagram plan generated from Software Intelligence */
function PlanApplier() {
  const context = useContext(AIGenerationContext);
  const generator = context?.generator;
  const runtime = context?.runtime;
  const isReady = useCanvasReady();
  const adapter = useCanvas();

  useEffect(() => {
    if (!generator || !isReady) return;
    const pending = localStorage.getItem('pending_generated_plan');
    if (pending) {
      try {
        const plan = JSON.parse(pending);
        localStorage.removeItem('pending_generated_plan');
        if (runtime) {
          const doc = runtime.getDocument();
          const existingNodeIds = Object.keys(doc.nodes);
          if (existingNodeIds.length > 0) {
            runtime.transaction(
              () => {
                for (const nid of existingNodeIds) {
                  runtime.executeType('node.delete', { id: nid });
                }
              },
              { label: 'Clear canvas for new architecture diagram', origin: 'program' }
            );
          }
        }
        generator.applyPlan(plan);
        setTimeout(() => {
          try {
            adapter.fitToScreen();
          } catch {
            // ignore
          }
        }, 150);
      } catch (e) {
        console.error('Failed to apply pending diagram plan:', e);
      }
    }
  }, [generator, isReady, adapter, runtime]);

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
  const activeTab = useProjectIntelligenceStore((s) => s.activeTab);

  return (
    <CanvasProvider>
      <DiagramRuntimeProvider data={diagram.data}>
        <AIGenerationProvider>
          <PlanApplier />
          <ActiveTabController />
          <EditorLayout
            project={project}
            isLoading={false}
            inspector={activeTab === 'canvas' ? <CanvasInspector /> : undefined}
            aiSidebar={activeTab === 'canvas' ? <AiSidebarSlot /> : undefined}
            statusBar={activeTab === 'canvas' ? <CanvasStatusBar /> : undefined}
          >
            <AutosaveController
              projectId={project.id}
              initialVersion={diagram.version}
            />
            <div className="relative h-full w-full">
              <Canvas />
            </div>
            {activeTab === 'intelligence' && (
              <div className="absolute inset-0 z-30 bg-background">
                <SoftwareIntelligenceWorkspace />
              </div>
            )}
          </EditorLayout>
        </AIGenerationProvider>
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

  // Self-heal legacy non-UUID slugs (such as 'microservices-architecture')
  useEffect(() => {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId || '') ||
      /^[0-9a-f]{32}$/i.test(projectId || '');

    if (projectId && !isUUID) {
      projectService
        .list()
        .then((projects) => {
          if (projects.length > 0) {
            window.location.replace(`/editor/${projects[0]!.id}`);
          }
        })
        .catch(() => {});
    }
  }, [projectId]);

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
