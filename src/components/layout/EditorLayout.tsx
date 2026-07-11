import type { ReactNode } from 'react';
import type { Project } from '@/types';
import { EditorTopBar } from '@/components/toolbar';
import { EditorSidebar } from '@/components/sidebar';
import { RightInspector, StatusBar } from '@/components/editor';

interface EditorLayoutProps {
  project: Project | null | undefined;
  isLoading: boolean;
  /** Canvas content (the placeholder today, the engine in Module 2). */
  children: ReactNode;
}

/**
 * Full-height editor shell: top navigation, a middle row of
 * [sidebar · canvas · inspector], and a bottom status bar. The layout owns the
 * chrome; the canvas content is injected as children.
 */
export function EditorLayout({ project, isLoading, children }: EditorLayoutProps) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <EditorTopBar project={project} isLoading={isLoading} />

      <div className="flex min-h-0 flex-1">
        <EditorSidebar activeId="projects" />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
        <RightInspector />
      </div>

      <StatusBar />
    </div>
  );
}
