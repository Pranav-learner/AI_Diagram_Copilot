/**
 * ContextBuilder — turns live diagram state into compact model context.
 *
 * The LLM must never see the raw, verbose DSL document; it sees a *summary*
 * shaped for tokens and relevance. The builder reads through the
 * {@link DiagramContextSource} **port** — it depends on `@/dsl` *types* only,
 * never on the diagram engine or runtime — so the AI layer stays decoupled and
 * the app wires the runtime to the port. Large diagrams are truncated to a node
 * budget with the omission made explicit (never silently), so the model is told
 * what it cannot see.
 */

import type {
  DiagramDocument,
  DiagramNode,
  DiagramEdge,
  Viewport,
  Point,
  Size,
} from '@/dsl';
import { estimateTokens } from '../core/tokens';

/**
 * The read-side port to the diagram. The app implements this over
 * `DiagramRuntime` (`getDocument`, selection, viewport); the AI layer only sees
 * this interface.
 */
export interface DiagramContextSource {
  getDocument(): DiagramDocument;
  /** Currently-selected entity ids, if the host tracks selection. */
  getSelection?(): readonly string[];
  /** Current viewport, if distinct from the document's stored viewport. */
  getViewport?(): Viewport;
}

export interface NodeSummary {
  readonly id: string;
  readonly type: string;
  readonly shape?: string;
  readonly semantic?: string;
  readonly label?: string;
  readonly position: Point;
  readonly size: Size;
}

export interface EdgeSummary {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
}

export interface DiagramSummary {
  readonly id: string;
  readonly name?: string;
  readonly schemaVersion: string;
  readonly counts: {
    readonly nodes: number;
    readonly edges: number;
    readonly groups: number;
    readonly layers: number;
  };
  readonly nodes: readonly NodeSummary[];
  readonly edges: readonly EdgeSummary[];
  /** True when nodes/edges were omitted to fit the budget. */
  readonly truncated: boolean;
}

export interface DiagramContext {
  readonly diagram: DiagramSummary;
  readonly selection: readonly string[];
  readonly viewport?: Viewport;
  /** Estimated token cost of the rendered context. */
  readonly estimatedTokens: number;
}

export interface ContextBuilderOptions {
  /** Soft token budget for the rendered context block. */
  readonly tokenBudget?: number;
  /** Hard cap on the number of nodes included before truncation. */
  readonly maxNodes?: number;
  /** Hard cap on the number of edges included before truncation. */
  readonly maxEdges?: number;
}

const DEFAULT_MAX_NODES = 150;
const DEFAULT_MAX_EDGES = 300;

export class ContextBuilder {
  private readonly maxNodes: number;
  private readonly maxEdges: number;
  private readonly tokenBudget: number;

  constructor(options: ContextBuilderOptions = {}) {
    this.maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
    this.maxEdges = options.maxEdges ?? DEFAULT_MAX_EDGES;
    this.tokenBudget = options.tokenBudget ?? 8_000;
  }

  /** Build a summarized context from the current diagram. */
  build(source: DiagramContextSource): DiagramContext {
    const doc = source.getDocument();
    const summary = this.summarize(doc);
    const selection = source.getSelection?.() ?? [];
    const viewport = source.getViewport?.() ?? doc.viewport;
    const estimatedTokens = estimateTokens(renderSummary(summary, selection));
    return { diagram: summary, selection, viewport, estimatedTokens };
  }

  /**
   * Render a context as a compact, fenced JSON block for prompt injection. If it
   * overflows the token budget, rebuild with a tighter node cap and mark it
   * truncated — the model always gets *something* within budget.
   */
  render(context: DiagramContext): string {
    let block = renderSummary(context.diagram, context.selection);
    if (estimateTokens(block) <= this.tokenBudget) return block;

    // Overflow: progressively shrink the node budget until it fits.
    let cap = context.diagram.nodes.length;
    while (cap > 1 && estimateTokens(block) > this.tokenBudget) {
      cap = Math.floor(cap / 2);
      const shrunk: DiagramSummary = {
        ...context.diagram,
        nodes: context.diagram.nodes.slice(0, cap),
        edges: context.diagram.edges.slice(0, cap * 2),
        truncated: true,
      };
      block = renderSummary(shrunk, context.selection);
    }
    return block;
  }

  private summarize(doc: DiagramDocument): DiagramSummary {
    const allNodes = Object.values(doc.nodes);
    const allEdges = Object.values(doc.edges);
    // Prefer the top-most nodes (higher z = more salient) when truncating.
    const nodes = [...allNodes]
      .sort((a, b) => b.z - a.z)
      .slice(0, this.maxNodes)
      .map(summarizeNode);
    const edges = allEdges.slice(0, this.maxEdges).map(summarizeEdge);
    return {
      id: doc.id,
      name: doc.name,
      schemaVersion: doc.schemaVersion,
      counts: {
        nodes: allNodes.length,
        edges: allEdges.length,
        groups: Object.keys(doc.groups).length,
        layers: Object.keys(doc.layers).length,
      },
      nodes,
      edges,
      truncated: allNodes.length > nodes.length || allEdges.length > edges.length,
    };
  }
}

function summarizeNode(node: DiagramNode): NodeSummary {
  const base: NodeSummary = {
    id: node.id,
    type: node.type,
    label: labelOf(node),
    position: node.position,
    size: node.size,
  };
  if (node.type === 'shape') return { ...base, shape: node.shape, semantic: node.semantic };
  return base;
}

function labelOf(node: DiagramNode): string | undefined {
  if ('label' in node && node.label?.text) return node.label.text;
  if (node.type === 'text') return node.text;
  return undefined;
}

function summarizeEdge(edge: DiagramEdge): EdgeSummary {
  return { id: edge.id, source: edge.source.nodeId, target: edge.target.nodeId, label: edge.label?.text };
}

/** Serialize a summary to a compact fenced JSON block. */
function renderSummary(summary: DiagramSummary, selection: readonly string[]): string {
  const payload = selection.length ? { ...summary, selection } : summary;
  return ['```json', JSON.stringify(payload), '```'].join('\n');
}
