import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UseAiCopilot } from '../useAiCopilot';
import { TurnCard } from './TurnCard';

const EXAMPLES = [
  'Design a microservice architecture',
  'Draw a login flowchart',
  'Add a cache between the API and the Database',
  'Color all services blue',
];

/** The scrolling conversation log of {@link TurnCard}s, with an empty state. */
export function AiConversation({ copilot, debug }: { copilot: UseAiCopilot; debug: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = copilot.turns.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);

  if (count === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Your AI copilot</p>
          <p className="text-sm text-muted-foreground">Describe a diagram to create, or ask for an edit. Every change is previewed and undoable.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {EXAMPLES.map((ex) => (
            <Button key={ex} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => copilot.send(ex)}>
              {ex}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" role="log" aria-label="AI conversation" aria-live="polite">
      {copilot.turns.map((turn) => (
        <TurnCard key={turn.id} turn={turn} copilot={copilot} debug={debug} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
