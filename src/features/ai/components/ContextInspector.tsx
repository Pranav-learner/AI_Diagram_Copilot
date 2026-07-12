import { useContext, useSyncExternalStore } from 'react';
import { Boxes, MousePointerClick, Gauge, MessagesSquare } from 'lucide-react';
import { understandDiagram, understandingTokens } from '@/ai';
import { AIGenerationContext } from '../AIGenerationContext';
import { useAiConversationStore } from '../store/useAiConversationStore';

/**
 * "What the AI currently sees" — a live view of the diagram summary, selection,
 * context size (tokens), and conversation length. Reads through the same context
 * source the model does, so it never drifts from reality.
 */
export function ContextInspector() {
  const ctx = useContext(AIGenerationContext);
  const turnCount = useAiConversationStore((s) => s.turns.length);
  // Recompute when the runtime commits (document/selection changes).
  const version = useSyncExternalStore(
    (cb) => (ctx ? ctx.runtime.events.on('commit', cb) : () => {}),
    () => (ctx ? ctx.runtime.getVersion() : 0),
    () => 0,
  );
  if (!ctx) return null;
  void version;

  const understanding = understandDiagram(ctx.contextSource);
  const tokens = understandingTokens(understanding);

  return (
    <div className="space-y-3 p-3 text-sm">
      <Row icon={Boxes} label="Diagram">
        {understanding.counts.nodes} nodes · {understanding.counts.edges} edges · {understanding.counts.groups} groups
      </Row>
      <Row icon={MousePointerClick} label="Selection">
        {understanding.selection.length === 0 ? 'Nothing selected' : `${understanding.selection.length} selected`}
      </Row>
      <Row icon={Gauge} label="Context size">
        ~{tokens.toLocaleString()} tokens{understanding.truncated ? ' (truncated)' : ''}
      </Row>
      <Row icon={MessagesSquare} label="Conversation">
        {turnCount} turn{turnCount === 1 ? '' : 's'}
      </Row>
      <p className="border-t pt-2 text-xs text-muted-foreground">
        The copilot sees element ids, labels, roles, positions, sizes, groups, and the current selection — never renderer details.
      </p>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Boxes; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="truncate">{children}</div>
      </div>
    </div>
  );
}
