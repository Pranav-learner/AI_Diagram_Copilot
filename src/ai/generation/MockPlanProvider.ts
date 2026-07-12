/**
 * A heuristic, network-free provider that emits a valid DiagramPlan.
 *
 * It is a real {@link AIProvider} (honouring the abstraction), not a bypass:
 * output still flows through validation → execution planning → runtime. It lets
 * the feature run end-to-end with **no API key** (dev/demo) and makes tests
 * deterministic. It inspects the prompt for a diagram type + keywords and
 * returns a canned-but-plausible plan for that type. Real generation quality
 * comes from swapping in Anthropic/OpenAI/Gemini via configuration alone.
 */

import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';
import type { DiagramType } from './model/DiagramType';
import { DIAGRAM_TYPES } from './model/DiagramType';

const CAPS: ProviderCapabilities = { streaming: true, jsonMode: true, systemPrompt: true, maxContextTokens: 100_000 };

export interface MockPlanProviderOptions {
  readonly id?: string;
  readonly chunkSize?: number;
}

export class MockPlanProvider implements AIProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  private readonly chunkSize: number;

  constructor(options: MockPlanProviderOptions = {}) {
    this.id = options.id ?? 'mock-plan';
    this.chunkSize = options.chunkSize ?? 48;
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    if (signal?.aborted) throw new CancelledError();
    const prompt = lastUserContent(request);
    const text = JSON.stringify(buildPlan(prompt));
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

export function mockPlanProvider(options?: MockPlanProviderOptions): MockPlanProvider {
  return new MockPlanProvider(options);
}

// ── Heuristic plan construction ──────────────────────────────────────────────

function lastUserContent(request: ResolvedRequest): string {
  const user = [...request.messages].reverse().find((m) => m.role === 'user');
  return user?.content ?? '';
}

const TYPE_KEYWORDS: ReadonlyArray<{ type: DiagramType; patterns: RegExp }> = [
  { type: 'architecture', patterns: /architect|microservice|system|service|backend|infrastructure|netflix|api/i },
  { type: 'sequence', patterns: /sequence|interaction|request flow|message|api call/i },
  { type: 'erd', patterns: /\ber\b|entity|entities|database schema|data model|erd/i },
  { type: 'class', patterns: /uml|class diagram|classes|inheritance/i },
  { type: 'state', patterns: /state machine|states|transition|lifecycle/i },
  { type: 'decision-tree', patterns: /decision tree|decision/i },
  { type: 'org-chart', patterns: /org chart|organization|reporting|hierarchy of (people|roles)/i },
  { type: 'network', patterns: /network|topology|router|switch|lan|subnet/i },
  { type: 'timeline', patterns: /timeline|roadmap|milestones|schedule|chronolog/i },
  { type: 'mindmap', patterns: /mind ?map|brainstorm|ideas around/i },
  { type: 'flowchart', patterns: /flow ?chart|flow|process|steps|workflow|algorithm/i },
];

function detectType(prompt: string): DiagramType {
  // Honour an explicit "Preferred diagram type: X" hint first.
  const hint = /preferred diagram type:\s*([a-z-]+)/i.exec(prompt);
  if (hint && (DIAGRAM_TYPES as readonly string[]).includes(hint[1]!.toLowerCase())) {
    return hint[1]!.toLowerCase() as DiagramType;
  }
  for (const { type, patterns } of TYPE_KEYWORDS) if (patterns.test(prompt)) return type;
  return 'flowchart';
}

interface RawPlan {
  diagramType: DiagramType;
  title: string;
  layout?: string;
  nodes: Array<{ id: string; label: string; type?: string; parent?: string; group?: string }>;
  relationships: Array<{ source: string; target: string; label?: string; type?: string }>;
  groups?: Array<{ id: string; label: string; nodeIds: string[] }>;
  confidence: number;
  version: string;
}

function buildPlan(prompt: string): RawPlan {
  const type = detectType(prompt);
  const title = titleFromPrompt(prompt, type);
  return { ...TEMPLATES[type](), diagramType: type, title, confidence: 0.85, version: 'mock' };
}

function titleFromPrompt(prompt: string, type: DiagramType): string {
  const cleaned = prompt.split('\n')[0]!.replace(/preferred diagram type:.*/i, '').trim();
  const words = cleaned.replace(/^(design|create|draw|generate|make|build|show)\s+(a|an|the)?\s*/i, '').trim();
  const title = words.length > 3 ? words : `${type} diagram`;
  return title.charAt(0).toUpperCase() + title.slice(1, 60);
}

type Template = () => Omit<RawPlan, 'diagramType' | 'title' | 'confidence' | 'version'>;

const TEMPLATES: Record<DiagramType, Template> = {
  flowchart: () => ({
    layout: 'hierarchical',
    nodes: [
      { id: 'start', label: 'Start', type: 'start' },
      { id: 'input', label: 'Receive request', type: 'input' },
      { id: 'check', label: 'Valid?', type: 'decision' },
      { id: 'process', label: 'Process request', type: 'process' },
      { id: 'error', label: 'Return error', type: 'process' },
      { id: 'end', label: 'End', type: 'end' },
    ],
    relationships: [
      { source: 'start', target: 'input' },
      { source: 'input', target: 'check' },
      { source: 'check', target: 'process', label: 'yes' },
      { source: 'check', target: 'error', label: 'no' },
      { source: 'process', target: 'end' },
      { source: 'error', target: 'end' },
    ],
  }),
  architecture: () => ({
    layout: 'hierarchical',
    nodes: [
      { id: 'client', label: 'Client', type: 'client' },
      { id: 'gateway', label: 'API Gateway', type: 'gateway' },
      { id: 'auth', label: 'Auth Service', type: 'service', group: 'services' },
      { id: 'catalog', label: 'Catalog Service', type: 'service', group: 'services' },
      { id: 'orders', label: 'Order Service', type: 'service', group: 'services' },
      { id: 'db', label: 'Database', type: 'database' },
      { id: 'cache', label: 'Cache', type: 'cache' },
      { id: 'queue', label: 'Message Queue', type: 'queue' },
    ],
    groups: [{ id: 'services', label: 'Services', nodeIds: ['auth', 'catalog', 'orders'] }],
    relationships: [
      { source: 'client', target: 'gateway', label: 'HTTPS' },
      { source: 'gateway', target: 'auth' },
      { source: 'gateway', target: 'catalog' },
      { source: 'gateway', target: 'orders' },
      { source: 'catalog', target: 'db' },
      { source: 'orders', target: 'db' },
      { source: 'catalog', target: 'cache' },
      { source: 'orders', target: 'queue' },
    ],
  }),
  mindmap: () => ({
    layout: 'mindmap',
    nodes: [
      { id: 'root', label: 'Topic', type: 'topic' },
      { id: 'a', label: 'Idea A', type: 'subtopic', parent: 'root' },
      { id: 'b', label: 'Idea B', type: 'subtopic', parent: 'root' },
      { id: 'c', label: 'Idea C', type: 'subtopic', parent: 'root' },
      { id: 'd', label: 'Idea D', type: 'subtopic', parent: 'root' },
      { id: 'a1', label: 'Detail A1', type: 'subtopic', parent: 'a' },
      { id: 'b1', label: 'Detail B1', type: 'subtopic', parent: 'b' },
    ],
    relationships: [
      { source: 'root', target: 'a' },
      { source: 'root', target: 'b' },
      { source: 'root', target: 'c' },
      { source: 'root', target: 'd' },
      { source: 'a', target: 'a1' },
      { source: 'b', target: 'b1' },
    ],
  }),
  sequence: () => ({
    layout: 'horizontal',
    nodes: [
      { id: 'user', label: 'User', type: 'actor' },
      { id: 'web', label: 'Web App', type: 'participant' },
      { id: 'api', label: 'API', type: 'participant' },
      { id: 'db', label: 'Database', type: 'participant' },
    ],
    relationships: [
      { source: 'user', target: 'web', label: '1. submit', type: 'message' },
      { source: 'web', target: 'api', label: '2. request', type: 'message' },
      { source: 'api', target: 'db', label: '3. query', type: 'message' },
      { source: 'db', target: 'api', label: '4. rows', type: 'message', },
      { source: 'api', target: 'web', label: '5. response', type: 'message' },
      { source: 'web', target: 'user', label: '6. render', type: 'message' },
    ],
  }),
  erd: () => ({
    layout: 'flow',
    nodes: [
      { id: 'user', label: 'User', type: 'entity' },
      { id: 'order', label: 'Order', type: 'entity' },
      { id: 'item', label: 'OrderItem', type: 'entity' },
      { id: 'product', label: 'Product', type: 'entity' },
    ],
    relationships: [
      { source: 'user', target: 'order', label: '1..*', type: 'association' },
      { source: 'order', target: 'item', label: '1..*', type: 'composition' },
      { source: 'product', target: 'item', label: '1..*', type: 'association' },
    ],
  }),
  class: () => ({
    layout: 'hierarchical',
    nodes: [
      { id: 'animal', label: 'Animal', type: 'class' },
      { id: 'dog', label: 'Dog', type: 'class' },
      { id: 'cat', label: 'Cat', type: 'class' },
      { id: 'owner', label: 'Owner', type: 'class' },
    ],
    relationships: [
      { source: 'dog', target: 'animal', label: 'extends', type: 'inheritance' },
      { source: 'cat', target: 'animal', label: 'extends', type: 'inheritance' },
      { source: 'owner', target: 'animal', label: 'owns', type: 'aggregation' },
    ],
  }),
  state: () => ({
    layout: 'flow',
    nodes: [
      { id: 'idle', label: 'Idle', type: 'initial' },
      { id: 'running', label: 'Running', type: 'state' },
      { id: 'paused', label: 'Paused', type: 'state' },
      { id: 'stopped', label: 'Stopped', type: 'final' },
    ],
    relationships: [
      { source: 'idle', target: 'running', label: 'start', type: 'transition' },
      { source: 'running', target: 'paused', label: 'pause', type: 'transition' },
      { source: 'paused', target: 'running', label: 'resume', type: 'transition' },
      { source: 'running', target: 'stopped', label: 'stop', type: 'transition' },
    ],
  }),
  'decision-tree': () => ({
    layout: 'tree',
    nodes: [
      { id: 'root', label: 'Weather?', type: 'decision' },
      { id: 'sunny', label: 'Sunny', type: 'decision', parent: 'root' },
      { id: 'rainy', label: 'Rainy', type: 'decision', parent: 'root' },
      { id: 'walk', label: 'Go for a walk', type: 'outcome', parent: 'sunny' },
      { id: 'read', label: 'Stay in and read', type: 'outcome', parent: 'rainy' },
    ],
    relationships: [
      { source: 'root', target: 'sunny', label: 'sunny' },
      { source: 'root', target: 'rainy', label: 'rainy' },
      { source: 'sunny', target: 'walk' },
      { source: 'rainy', target: 'read' },
    ],
  }),
  'org-chart': () => ({
    layout: 'tree',
    nodes: [
      { id: 'ceo', label: 'CEO', type: 'role' },
      { id: 'cto', label: 'CTO', type: 'role', parent: 'ceo' },
      { id: 'cfo', label: 'CFO', type: 'role', parent: 'ceo' },
      { id: 'eng', label: 'Engineering Lead', type: 'role', parent: 'cto' },
      { id: 'design', label: 'Design Lead', type: 'role', parent: 'cto' },
    ],
    relationships: [
      { source: 'ceo', target: 'cto' },
      { source: 'ceo', target: 'cfo' },
      { source: 'cto', target: 'eng' },
      { source: 'cto', target: 'design' },
    ],
  }),
  network: () => ({
    layout: 'radial',
    nodes: [
      { id: 'router', label: 'Core Router', type: 'router' },
      { id: 'sw1', label: 'Switch A', type: 'switch' },
      { id: 'sw2', label: 'Switch B', type: 'switch' },
      { id: 'srv1', label: 'Server 1', type: 'server' },
      { id: 'srv2', label: 'Server 2', type: 'server' },
      { id: 'srv3', label: 'Server 3', type: 'server' },
    ],
    relationships: [
      { source: 'router', target: 'sw1' },
      { source: 'router', target: 'sw2' },
      { source: 'sw1', target: 'srv1' },
      { source: 'sw1', target: 'srv2' },
      { source: 'sw2', target: 'srv3' },
    ],
  }),
  timeline: () => ({
    layout: 'horizontal',
    nodes: [
      { id: 'e1', label: 'Kickoff', type: 'milestone' },
      { id: 'e2', label: 'Design', type: 'event' },
      { id: 'e3', label: 'Build', type: 'event' },
      { id: 'e4', label: 'Launch', type: 'milestone' },
    ],
    relationships: [
      { source: 'e1', target: 'e2' },
      { source: 'e2', target: 'e3' },
      { source: 'e3', target: 'e4' },
    ],
  }),
};
