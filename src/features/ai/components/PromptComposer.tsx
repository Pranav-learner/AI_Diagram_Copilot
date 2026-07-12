import { useRef, type KeyboardEvent } from 'react';
import { ArrowUp, BookMarked, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePromptLibraryStore } from '../store/usePromptLibraryStore';
import type { UseAiCopilot } from '../useAiCopilot';

/**
 * The prompt input: a growing textarea (Enter to send, Shift+Enter for a
 * newline), a send button, and a shortcut to save/open the prompt library.
 */
export function PromptComposer({ copilot, onOpenLibrary }: { copilot: UseAiCopilot; onOpenLibrary: () => void }) {
  const savePrompt = usePromptLibraryStore((s) => s.add);
  const ref = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      copilot.send();
    }
  };

  return (
    <div className="border-t bg-background p-2">
      <div className="rounded-lg border bg-card focus-within:ring-1 focus-within:ring-ring">
        <Textarea
          ref={ref}
          value={copilot.draft}
          onChange={(e) => copilot.setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the copilot — describe a diagram or an edit…"
          rows={2}
          aria-label="Message the AI copilot"
          className="min-h-0 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-1 px-2 pb-1.5">
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" onClick={onOpenLibrary} aria-label="Prompt library">
                  <BookMarked className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Prompt library</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => savePrompt(copilot.draft)}
                  disabled={!copilot.draft.trim()}
                  aria-label="Save prompt to library"
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save prompt</TooltipContent>
            </Tooltip>
          </div>
          <Button size="icon" className="size-7 rounded-full" onClick={() => copilot.send()} disabled={!copilot.draft.trim()} aria-label="Send">
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
