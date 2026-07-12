import { useState, type KeyboardEvent } from 'react';
import { Sparkles, Wand2, X, Ban, RotateCcw, AlertCircle } from 'lucide-react';
import { defaultDiagramTypeRegistry } from '@/ai';
import type { DiagramType } from '@/ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDiagramGeneration } from '../useDiagramGeneration';
import { GenerationProgress } from './GenerationProgress';

const DIAGRAM_TYPE_OPTIONS = defaultDiagramTypeRegistry.list();

/**
 * The floating "AI Generate" panel: describe a diagram in natural language and
 * watch it build through staged progress. Supports cancel, retry, and regenerate.
 * Overlays the canvas (top-left) and collapses to a launcher button.
 */
export function GenerationPanel() {
  const [open, setOpen] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<'auto' | DiagramType>('auto');
  const gen = useDiagramGeneration();

  const submit = () => gen.generate(prompt, { diagramType: type === 'auto' ? undefined : type });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!gen.isGenerating) submit();
    }
  };

  if (!open) {
    return (
      <Button className="absolute left-4 top-4 z-20 shadow-lg" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        Generate
      </Button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-20 flex w-[340px] flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">AI Diagram Generator</span>
        {gen.usingMock && (
          <Badge variant="secondary" className="ml-auto text-[10px]" title="No API key configured — using a built-in demo generator.">
            Demo
          </Badge>
        )}
        <button
          className={gen.usingMock ? 'ml-1 text-muted-foreground hover:text-foreground' : 'ml-auto text-muted-foreground hover:text-foreground'}
          onClick={() => setOpen(false)}
          aria-label="Collapse panel"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a diagram… e.g. Design a Netflix microservice architecture"
          rows={3}
          disabled={gen.isGenerating}
          className="resize-none text-sm"
        />

        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as 'auto' | DiagramType)} disabled={gen.isGenerating}>
            <SelectTrigger className="h-9 flex-1 text-sm">
              <SelectValue placeholder="Auto-detect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect type</SelectItem>
              {DIAGRAM_TYPE_OPTIONS.map((d) => (
                <SelectItem key={d.type} value={d.type}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {gen.isGenerating ? (
            <Button variant="outline" size="sm" onClick={gen.cancel}>
              <Ban className="size-4" />
              Cancel
            </Button>
          ) : (
            <Button size="sm" onClick={submit} disabled={!prompt.trim()}>
              <Wand2 className="size-4" />
              Generate
            </Button>
          )}
        </div>

        {gen.status !== 'idle' && (
          <>
            <Separator />
            <GenerationProgress stages={gen.stages} />
          </>
        )}

        {gen.status === 'error' && gen.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1 space-y-2">
              <p>{gen.error}</p>
              <Button variant="outline" size="sm" onClick={gen.retry}>
                <RotateCcw className="size-3.5" />
                Try again
              </Button>
            </div>
          </div>
        )}

        {gen.status === 'success' && gen.result && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Created {gen.result.plan.nodes.length} nodes
              {gen.result.warnings.length > 0 ? ` · ${gen.result.warnings.length} warning(s)` : ''}
            </span>
            <Button variant="outline" size="sm" onClick={gen.regenerate}>
              <RotateCcw className="size-3.5" />
              Regenerate
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
