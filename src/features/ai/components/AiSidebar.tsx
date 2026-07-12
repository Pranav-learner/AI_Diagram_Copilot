import { useState } from 'react';
import { Sparkles, Info, BookMarked, Settings2, Trash2, PanelRightClose, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/store';
import { useAiCopilot } from '../useAiCopilot';
import { useAiSettingsStore } from '../store/useAiSettingsStore';
import { AiConversation } from './AiConversation';
import { PromptComposer } from './PromptComposer';
import { ContextInspector } from './ContextInspector';
import { AiSettingsPanel } from './AiSettingsPanel';
import { PromptLibrary } from './PromptLibrary';

type View = 'chat' | 'context' | 'prompts' | 'settings';

/**
 * The dedicated, right-docked AI copilot sidebar: a conversation with streaming
 * progress, an execution timeline, operation summaries, previews, and history —
 * plus context, prompt-library, and settings views. It consumes the generator/
 * editor/runtime through {@link useAiCopilot}; it owns no business logic.
 */
export function AiSidebar() {
  const copilot = useAiCopilot();
  const debug = useAiSettingsStore((s) => s.debug);
  const close = useUIStore((s) => s.setAiSidebarOpen);
  const [view, setView] = useState<View>('chat');

  const reuse = (text: string) => {
    copilot.setDraft(text);
    setView('chat');
  };

  return (
    <aside
      className="flex h-full w-[360px] shrink-0 flex-col border-l bg-background"
      aria-label="AI copilot"
      role="complementary"
    >
      <header className="flex items-center gap-1 border-b px-2 py-2">
        <Sparkles className="ml-1 size-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold">AI Copilot</span>
        {copilot.usingMock && (
          <Badge variant="secondary" className="text-[10px]" title="No API key configured — using a built-in demo model.">
            Demo
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <NavButton label="Chat" icon={MessageSquare} active={view === 'chat'} onClick={() => setView('chat')} />
          <NavButton label="Context" icon={Info} active={view === 'context'} onClick={() => setView('context')} />
          <NavButton label="Prompts" icon={BookMarked} active={view === 'prompts'} onClick={() => setView('prompts')} />
          <NavButton label="Settings" icon={Settings2} active={view === 'settings'} onClick={() => setView('settings')} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={copilot.clearConversation}
                disabled={copilot.turns.length === 0}
                aria-label="Clear conversation"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear conversation</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => close(false)} aria-label="Close AI sidebar">
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </header>

      {view === 'chat' && (
        <>
          <AiConversation copilot={copilot} debug={debug} />
          <PromptComposer copilot={copilot} onOpenLibrary={() => setView('prompts')} />
        </>
      )}
      {view === 'context' && <div className="min-h-0 flex-1 overflow-y-auto">{<ContextInspector />}</div>}
      {view === 'prompts' && <div className="min-h-0 flex-1 overflow-hidden">{<PromptLibrary onReuse={reuse} />}</div>}
      {view === 'settings' && <div className="min-h-0 flex-1 overflow-y-auto">{<AiSettingsPanel />}</div>}
    </aside>
  );
}

function NavButton({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Info; active: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-7', active && 'bg-accent text-accent-foreground')}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
