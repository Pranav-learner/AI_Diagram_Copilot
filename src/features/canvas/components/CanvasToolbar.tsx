import { memo, type ComponentType } from 'react';
import {
  Circle,
  Diamond,
  Hand,
  Image as ImageIcon,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCanvas } from '../hooks/useCanvas';
import {
  useActiveTool,
  useCanvasHistory,
  useCanvasReady,
  useCanvasStatus,
} from '../hooks/useCanvasState';
import type { CanvasTool } from '../types/canvas';

interface ToolDef {
  tool: CanvasTool;
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
}

const TOOLS: readonly ToolDef[] = [
  { tool: 'selection', label: 'Select', icon: MousePointer2, shortcut: 'V' },
  { tool: 'hand', label: 'Pan', icon: Hand, shortcut: 'H' },
  { tool: 'rectangle', label: 'Rectangle', icon: Square, shortcut: 'R' },
  { tool: 'diamond', label: 'Diamond', icon: Diamond, shortcut: 'D' },
  { tool: 'ellipse', label: 'Ellipse', icon: Circle, shortcut: 'O' },
  { tool: 'arrow', label: 'Arrow', icon: MoveUpRight, shortcut: 'A' },
  { tool: 'line', label: 'Line', icon: Minus, shortcut: 'L' },
  { tool: 'freedraw', label: 'Draw', icon: Pencil, shortcut: 'P' },
  { tool: 'text', label: 'Text', icon: Type, shortcut: 'T' },
  { tool: 'image', label: 'Image', icon: ImageIcon },
];

interface IconButtonProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

/** A single toolbar button with tooltip and pressed state. */
const IconButton = memo(function IconButton({
  label,
  icon: Icon,
  onClick,
  active = false,
  disabled = false,
  shortcut,
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant={active ? 'default' : 'ghost'}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(!active && 'text-foreground/70')}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-1.5">
        {label}
        {shortcut && (
          <kbd className="rounded bg-background/20 px-1 text-[10px] font-medium">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * The app's primary editing toolbar. Every button drives the {@link CanvasEngine}
 * — no Excalidraw APIs are called here. Active tool, zoom, and history state are
 * read reactively from the canvas store.
 */
export const CanvasToolbar = memo(function CanvasToolbar() {
  const engine = useCanvas();
  const activeTool = useActiveTool();
  const { canUndo, canRedo } = useCanvasHistory();
  const { zoom } = useCanvasStatus();
  const isReady = useCanvasReady();

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-2">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border bg-card/95 p-1 shadow-lg backdrop-blur">
        {TOOLS.map(({ tool, label, icon, shortcut }) => (
          <IconButton
            key={tool}
            label={label}
            icon={icon}
            shortcut={shortcut}
            active={activeTool === tool}
            disabled={!isReady}
            onClick={() => engine.setTool(tool)}
          />
        ))}

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label="Undo"
          icon={Undo2}
          shortcut="Ctrl+Z"
          disabled={!isReady || !canUndo}
          onClick={() => engine.undo()}
        />
        <IconButton
          label="Redo"
          icon={Redo2}
          shortcut="Ctrl+Shift+Z"
          disabled={!isReady || !canRedo}
          onClick={() => engine.redo()}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label="Zoom out"
          icon={ZoomOut}
          disabled={!isReady}
          onClick={() => engine.zoomOut()}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!isReady}
              onClick={() => engine.resetZoom()}
              className="h-8 w-14 shrink-0 px-0 text-xs tabular-nums text-foreground/70"
              aria-label="Reset zoom to 100%"
            >
              {zoomPercent}%
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset zoom</TooltipContent>
        </Tooltip>
        <IconButton
          label="Zoom in"
          icon={ZoomIn}
          disabled={!isReady}
          onClick={() => engine.zoomIn()}
        />
        <IconButton
          label="Fit to screen"
          icon={Maximize}
          shortcut="Shift+1"
          disabled={!isReady}
          onClick={() => engine.fitToScreen()}
        />
      </div>
    </div>
  );
});
