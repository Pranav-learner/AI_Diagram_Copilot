import { useState } from 'react';
import { Search, Star, Copy, Trash2, CornerUpLeft, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';
import { usePromptLibraryStore, filterPrompts } from '../store/usePromptLibraryStore';

/**
 * The prompt library — reuse, duplicate, favorite, search, and delete saved
 * prompts. Export is a future placeholder. Persisted across sessions.
 */
export function PromptLibrary({ onReuse }: { onReuse: (text: string) => void }) {
  const [query, setQuery] = useState('');
  const prompts = usePromptLibraryStore((s) => s.prompts);
  const { remove, toggleFavorite, duplicate } = usePromptLibraryStore();
  const filtered = filterPrompts(prompts, query);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="h-8 pl-7 text-sm"
            aria-label="Search prompts"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button variant="ghost" size="icon" className="size-8" disabled aria-label="Export prompts">
                <Download className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Export · coming soon</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {prompts.length === 0 ? 'Saved prompts will appear here.' : 'No prompts match your search.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((p) => (
              <li key={p.id} className="group rounded-md border p-2 text-sm">
                <p className="mb-1.5 line-clamp-3">{p.text}</p>
                <div className="flex items-center gap-0.5">
                  <Button size="sm" variant="secondary" className="h-7" onClick={() => onReuse(p.text)}>
                    <CornerUpLeft className="size-3.5" /> Use
                  </Button>
                  <span className="flex-1" />
                  <IconBtn label={p.favorite ? 'Unfavorite' : 'Favorite'} onClick={() => toggleFavorite(p.id)}>
                    <Star className={cn('size-4', p.favorite && 'fill-amber-400 text-amber-400')} />
                  </IconBtn>
                  <IconBtn label="Duplicate" onClick={() => duplicate(p.id)}>
                    <Copy className="size-4" />
                  </IconBtn>
                  <IconBtn label="Delete" onClick={() => remove(p.id)}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="icon" className="size-7" onClick={onClick} aria-label={label} title={label}>
      {children}
    </Button>
  );
}
