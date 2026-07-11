import { memo } from 'react';
import { Copy, Group, Trash2, Ungroup } from 'lucide-react';
import { useCanvas } from '../hooks/useCanvas';
import { useSelectionCount } from '../hooks/useCanvasState';
import { IconButton } from './CanvasToolbar';

/**
 * Contextual action bar for the current selection — group, ungroup, duplicate,
 * delete. Appears below the main toolbar only when something is selected, so the
 * primary toolbar stays uncluttered. All actions go through the CanvasEngine.
 */
export const CanvasSelectionActions = memo(function CanvasSelectionActions() {
  const engine = useCanvas();
  const count = useSelectionCount();

  if (count === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-2">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border bg-card/95 p-1 shadow-md backdrop-blur animate-in fade-in slide-in-from-top-1">
        <IconButton
          label="Group"
          icon={Group}
          shortcut="Ctrl+G"
          disabled={count < 2}
          onClick={() => engine.groupSelected()}
        />
        <IconButton
          label="Ungroup"
          icon={Ungroup}
          shortcut="Ctrl+Shift+G"
          onClick={() => engine.ungroupSelected()}
        />
        <IconButton
          label="Duplicate"
          icon={Copy}
          shortcut="Ctrl+D"
          onClick={() => engine.duplicateSelected()}
        />
        <IconButton
          label="Delete"
          icon={Trash2}
          shortcut="Del"
          onClick={() => engine.deleteSelected()}
        />
      </div>
    </div>
  );
});
