import { useContext } from 'react';
import { RotateCcw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AIGenerationContext } from '../AIGenerationContext';
import { useAiSettingsStore } from '../store/useAiSettingsStore';

/**
 * AI settings — provider, model, sampling, streaming, prompt version, and debug —
 * plus a live session observability readout. Settings drive the AIService config
 * (the provider rebuilds on change); nothing here reimplements AI behaviour.
 */
export function AiSettingsPanel() {
  const ctx = useContext(AIGenerationContext);
  const s = useAiSettingsStore();
  const providers = ['auto', ...(ctx?.availableProviders ?? [])];
  const metrics = ctx?.metrics.snapshot();

  return (
    <div className="space-y-4 p-3 text-sm">
      <Field label="Provider" htmlFor="ai-provider">
        <Select value={s.provider} onValueChange={(v) => s.set({ provider: v })}>
          <SelectTrigger id="ai-provider" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>
                {p === 'auto' ? 'Auto (configured)' : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Model" htmlFor="ai-model" hint="Blank = provider default">
        <Input id="ai-model" value={s.model} onChange={(e) => s.set({ model: e.target.value })} placeholder={ctx?.model ?? 'default'} className="h-9" />
      </Field>

      <Field label={`Temperature — ${s.temperature.toFixed(1)}`} htmlFor="ai-temp">
        <input
          id="ai-temp"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={s.temperature}
          onChange={(e) => s.set({ temperature: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </Field>

      <Field label="Max tokens" htmlFor="ai-maxtokens">
        <Input
          id="ai-maxtokens"
          type="number"
          min={256}
          max={32000}
          step={256}
          value={s.maxTokens}
          onChange={(e) => s.set({ maxTokens: Number(e.target.value) })}
          className="h-9"
        />
      </Field>

      <Field label="Prompt version" htmlFor="ai-promptver">
        <Select value={s.promptVersion} onValueChange={(v) => s.set({ promptVersion: v })}>
          <SelectTrigger id="ai-promptver" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="v1">v1</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <ToggleRow label="Streaming" hint="Show tokens as they arrive" checked={s.streaming} onChange={(v) => s.set({ streaming: v })} />
      <ToggleRow label="Debug mode" hint="Show raw output + error details" checked={s.debug} onChange={(v) => s.set({ debug: v })} />

      <Button variant="outline" size="sm" onClick={s.reset}>
        <RotateCcw className="size-3.5" /> Reset to defaults
      </Button>

      <Separator />

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session</h3>
        {metrics && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Stat label="Requests" value={metrics.requests} />
            <Stat label="Success rate" value={metrics.requests ? `${Math.round(metrics.successRate * 100)}%` : '—'} />
            <Stat label="Tokens" value={metrics.tokens.totalTokens} />
            <Stat label="Avg latency" value={metrics.latency.count ? `${Math.round(metrics.latency.avgMs)}ms` : '—'} />
            <Stat label="Retries" value={metrics.retries} />
            <Stat label="Validation fails" value={metrics.validationFailures} />
          </dl>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Tool settings will appear here in a future release.</p>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
