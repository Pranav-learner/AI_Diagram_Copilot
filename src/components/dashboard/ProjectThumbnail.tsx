import { Network } from 'lucide-react';
import { cn } from '@/utils/cn';
import { getThumbnailGradient } from '@/utils/thumbnail';
import type { Project } from '@/types';

interface ProjectThumbnailProps {
  project: Project;
  className?: string;
}

/**
 * Placeholder thumbnail for a project. Diagram rendering does not exist yet, so
 * we show a deterministic gradient (stable per project id) with a glyph. When
 * real thumbnails arrive, `project.thumbnailUrl` takes over.
 */
export function ProjectThumbnail({ project, className }: ProjectThumbnailProps) {
  const gradient = getThumbnailGradient(project.id);

  if (project.thumbnailUrl) {
    return (
      <img
        src={project.thumbnailUrl}
        alt=""
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden',
        className,
      )}
      style={{ background: gradient.css }}
      aria-hidden
    >
      <div className="canvas-grid absolute inset-0 opacity-40" />
      <Network className="size-8 text-white/85 drop-shadow-sm" strokeWidth={1.5} />
    </div>
  );
}
