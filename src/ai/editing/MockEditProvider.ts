/**
 * A heuristic, network-free provider that emits a valid EditPlan.
 *
 * A real {@link AIProvider} (not a bypass): its output still flows through
 * validation → reference resolution → preview → execution. It reads the injected
 * diagram context + the user prompt and pattern-matches common editing intents
 * (add/remove/rename/connect/recolour/group/move). It lets the feature run with
 * **no API key** and makes tests deterministic; real quality comes from swapping
 * in a real provider by configuration.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';
import type { EditOp, ElementReference, SuperlativeMetric } from './model/EditPlan';

const CAPS: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 100_000 };

interface CtxNode {
  id: string;
  label: string;
  role?: string;
}

const COLORS = ['red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'purple', 'pink', 'gray', 'grey'];

const ROLE_BY_WORD: Readonly<Record<string, string>> = {
  redis: 'cache',
  cache: 'cache',
  database: 'database',
  db: 'database',
  postgres: 'database',
  postgresql: 'database',
  mysql: 'database',
  mongo: 'database',
  queue: 'queue',
  kafka: 'queue',
  rabbitmq: 'queue',
  gateway: 'gateway',
  api: 'api',
  service: 'service',
  server: 'server',
  cloud: 'cloud',
};

export class MockEditProvider implements AIProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  private readonly chunkSize: number;

  constructor(options: { id?: string; chunkSize?: number } = {}) {
    this.id = options.id ?? 'mock-edit';
    this.chunkSize = options.chunkSize ?? 48;
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    if (signal?.aborted) throw new CancelledError();
    const prompt = lastUser(request);
    const nodes = parseContextNodes(request);
    const text = JSON.stringify(buildEditPlan(prompt, nodes));
    return {
      text,
      finishReason: 'stop',
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: estimateMessagesTokens(request.messages),
        completionTokens: estimateTokens(text),
        totalTokens: estimateMessagesTokens(request.messages) + estimateTokens(text),
      },
    };
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const response = await this.complete(request, signal);
    for (let i = 0; i < response.text.length; i += this.chunkSize) {
      if (signal?.aborted) throw new CancelledError();
      yield { delta: response.text.slice(i, i + this.chunkSize), done: false };
    }
    yield { delta: '', done: true, finishReason: 'stop', usage: response.usage };
  }
}

export function mockEditProvider(options?: { id?: string; chunkSize?: number }): MockEditProvider {
  return new MockEditProvider(options);
}

// ── Parsing the injected diagram context ─────────────────────────────────────

function lastUser(request: ResolvedRequest): string {
  return [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
}

function parseContextNodes(request: ResolvedRequest): CtxNode[] {
  for (const message of request.messages) {
    const match = /```json\s*([\s\S]*?)```/.exec(message.content);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]!.trim()) as { nodes?: Array<{ id: string; label: string; role?: string }> };
      if (Array.isArray(parsed.nodes)) return parsed.nodes.map((n) => ({ id: n.id, label: n.label, role: n.role }));
    } catch {
      /* ignore */
    }
  }
  return [];
}

// ── Heuristic plan construction ──────────────────────────────────────────────

interface RawPlan {
  summary: string;
  edits: EditOp[];
  confidence: number;
  version: string;
}

function buildEditPlan(prompt: string, nodes: CtxNode[]): RawPlan {
  const edits = matchEdits(prompt, nodes);
  return { summary: prompt.split('\n')[0]!.slice(0, 80), edits, confidence: 0.85, version: 'mock' };
}

function matchEdits(prompt: string, nodes: CtxNode[]): EditOp[] {
  const p = prompt.toLowerCase();

  // Recolour: "color/make X <color>"
  const colorWord = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(p));
  if (colorWord && /\b(colou?r|make|paint|highlight)\b/.test(p)) {
    const subject = p.replace(/.*(colou?r|make|paint|highlight)\s+/, '').replace(new RegExp(`\\b${colorWord}\\b.*`), '').trim();
    const targets = subjectTargets(subject, nodes);
    return [{ op: 'update_style', targets, style: { fill: colorWord } }];
  }

  // Add between: "add X between A and B"
  const between = /add\s+(?:a|an|the)?\s*(.+?)\s+between\s+(.+?)\s+and\s+(.+)/.exec(p);
  if (between) {
    const label = titleCase(between[1]!.trim());
    const a = refFor(between[2]!.trim(), nodes);
    const b = refFor(between[3]!.trim(), nodes);
    const ref = slug(label);
    return [
      { op: 'add_node', ref, label, nodeType: roleFor(label), near: a, direction: 'right' },
      { op: 'connect', source: a, target: { by: 'new', ref } },
      { op: 'connect', source: { by: 'new', ref }, target: b },
    ];
  }

  // Rename: "rename A to B"
  const rename = /rename\s+(.+?)\s+(?:to|as)\s+(.+)/.exec(p);
  if (rename) return [{ op: 'rename_node', target: refFor(rename[1]!.trim(), nodes), label: titleCase(rename[2]!.trim()) }];

  // Connect: "connect A to B"
  const connect = /(?:connect|link|draw (?:an? )?(?:edge|arrow|line) from)\s+(.+?)\s+(?:to|and|with)\s+(.+)/.exec(p);
  if (connect) return [{ op: 'connect', source: refFor(connect[1]!.trim(), nodes), target: refFor(connect[2]!.trim(), nodes) }];

  // Disconnect: "disconnect A from B"
  const disconnect = /(?:disconnect|unlink)\s+(.+?)\s+(?:from|to|and)\s+(.+)/.exec(p);
  if (disconnect) return [{ op: 'disconnect', source: refFor(disconnect[1]!.trim(), nodes), target: refFor(disconnect[2]!.trim(), nodes) }];

  // Move: "move X below/above/left of/right of Y" or "move these left"
  const move = /move\s+(.+?)\s+(above|below|under(?:neath)?|over|to the left(?: of)?|to the right(?: of)?|left of|right of)\s*(.*)/.exec(p);
  if (move) {
    const target = refFor(move[1]!.trim(), nodes);
    const direction = normalizeDirection(move[2]!);
    const anchorText = move[3]!.trim();
    const to = anchorText ? { relativeTo: refFor(anchorText, nodes), direction } : { direction };
    return [{ op: 'move_node', target, to }];
  }

  // Group: "group A, B [and C] [as G]" / "group all authentication components"
  const group = /group\s+(.+)/.exec(p);
  if (group) {
    const rest = group[1]!.trim();
    const asMatch = /\s+as\s+(.+)$/.exec(rest);
    const label = asMatch ? titleCase(asMatch[1]!.trim()) : 'Group';
    const subject = asMatch ? rest.slice(0, asMatch.index).trim() : rest;
    return [{ op: 'group', targets: subjectTargets(subject, nodes), label }];
  }

  // Ungroup: "ungroup X"
  const ungroup = /ungroup\s+(.+)/.exec(p);
  if (ungroup) return [{ op: 'ungroup', target: refFor(ungroup[1]!.trim(), nodes) }];

  // Delete/remove: "delete X"
  const remove = /(?:delete|remove|drop)\s+(.+)/.exec(p);
  if (remove) return [{ op: 'remove_node', target: refFor(remove[1]!.trim(), nodes) }];

  // Add (general): "add X" / "add a Y called X"
  const add = /add\s+(?:a|an|the)?\s*(.+)/.exec(p);
  if (add) {
    const named = /(?:called|named)\s+(.+)/.exec(add[1]!);
    const label = titleCase((named ? named[1]! : add[1]!).replace(/\bnode\b|\bcalled\b.*/g, '').trim());
    return [{ op: 'add_node', ref: slug(label) || 'new-node', label: label || 'New Node', nodeType: roleFor(label) }];
  }

  // Fallback: interpret the whole prompt as a node to add.
  const label = titleCase(prompt.trim()).slice(0, 40) || 'New Node';
  return [{ op: 'add_node', ref: slug(label) || 'new-node', label, nodeType: roleFor(label) }];
}

/** Build a reference for a phrase: selection, unique label, superlative, or descriptor. */
function refFor(phrase: string, nodes: CtxNode[]): ElementReference {
  const t = phrase.replace(/^the\s+/, '').trim();
  if (/\b(these|this|selected|selection)\b/.test(t)) return { by: 'selection' };
  const sup = /\b(largest|biggest|smallest|leftmost|rightmost|topmost|bottommost|left|right|top|bottom)\b/.exec(t);
  if (sup) return { by: 'superlative', metric: mapSuperlative(sup[1]!) };
  const exact = nodes.filter((n) => n.label.toLowerCase() === t);
  if (exact.length === 1) return { by: 'label', label: exact[0]!.label };
  const contains = nodes.filter((n) => t.includes(n.label.toLowerCase()) || n.label.toLowerCase().includes(t));
  if (contains.length === 1) return { by: 'label', label: contains[0]!.label };
  // Ambiguous or generic → descriptor (the app will ask if it matches several).
  return { by: 'descriptor', text: t };
}

/** For plural targets (recolour/group): expand to concrete ids by role/label, else a descriptor. */
function subjectTargets(subject: string, nodes: CtxNode[]): ElementReference[] {
  const s = subject.replace(/^(all|the)\s+/g, '').replace(/\bcomponents?\b|\bnodes?\b|\bservices?\b/g, (m) => (m.startsWith('service') ? 'service' : '')).trim();
  if (/\b(these|selected|selection)\b/.test(subject)) return [{ by: 'selection' }];
  const roleHit = Object.keys(ROLE_BY_WORD).find((w) => subject.includes(w));
  if (roleHit) {
    const role = ROLE_BY_WORD[roleHit]!;
    const ids = nodes.filter((n) => n.role === role || n.label.toLowerCase().includes(roleHit));
    if (ids.length > 0) return ids.map((n) => ({ by: 'id', id: n.id }));
  }
  // Match nodes whose label contains a significant token of the subject.
  const tokens = s.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const matched = nodes.filter((n) => tokens.some((tok) => n.label.toLowerCase().includes(tok)));
  if (matched.length > 0) return matched.map((n) => ({ by: 'id', id: n.id }));
  return [{ by: 'descriptor', text: s || subject }];
}

function roleFor(label: string): string | undefined {
  const words = label.toLowerCase().split(/\s+/);
  for (const w of words) if (ROLE_BY_WORD[w]) return ROLE_BY_WORD[w];
  return undefined;
}

function mapSuperlative(word: string): SuperlativeMetric {
  const map: Record<string, SuperlativeMetric> = {
    largest: 'largest',
    biggest: 'largest',
    smallest: 'smallest',
    leftmost: 'leftmost',
    left: 'leftmost',
    rightmost: 'rightmost',
    right: 'rightmost',
    topmost: 'topmost',
    top: 'topmost',
    bottommost: 'bottommost',
    bottom: 'bottommost',
  };
  return map[word] ?? 'largest';
}

function normalizeDirection(word: string): 'above' | 'below' | 'left' | 'right' {
  if (/above|over/.test(word)) return 'above';
  if (/below|under/.test(word)) return 'below';
  if (/left/.test(word)) return 'left';
  return 'right';
}

function titleCase(text: string): string {
  return text
    .replace(/[."']+$/, '')
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
