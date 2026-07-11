import type { ReactNode } from 'react';
import type { Project } from '@/types';
import { EditorTopBar } from '@/components/toolbar';
import { EditorSidebar } from '@/components/sidebar';

interface EditorLayoutProps {
  project: Project | null | undefined;
  isLoading: boolean;
  /** Canvas area content (the Excalidraw host). */
  children: ReactNode;
  /** Right inspector panel. */
  inspector?: ReactNode;
  /** Bottom status bar. */
  statusBar?: ReactNode;
}

/**
 * Full-height editor shell: top navigation, a middle row of
 * [sidebar · canvas · inspector], and a bottom status bar. The layout owns the
 * chrome and slots; the canvas engine and its panels are injected by the page,
 * keeping this layout free of any Excalidraw/canvas coupling.
 */
export function EditorLayout({
  project,
  isLoading,
  children,
  inspector,
  statusBar,
}: EditorLayoutProps) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <EditorTopBar project={project} isLoading={isLoading} />

      <div className="flex min-h-0 flex-1">
        <EditorSidebar activeId="projects" />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
        {inspector}
      </div>

      {statusBar}
    </div>
  );
}
