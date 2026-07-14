/**
 * Semantic summaries — deterministic, renderer-independent prose + structured
 * digests describing a diagram, a group, a selection, a subgraph, or one entity.
 *
 * These are *not* LLM-generated: they are cheap, stable descriptions the future
 * Context Builder feeds *into* the LLM as grounding ("here is what the diagram
 * is"). Because they are pure functions of the Semantic Graph they are trivially
 * cacheable and reproducible. Language is intentionally compact — every token
 * spent here is a token the model reads.
 */

import type { SemanticGraph } from '../model/graph';
import type { SemanticEntity } from '../model/entity';
import { connectedComponents, isolated, sinks, sources } from '../analysis/components';

export type TopologyShape =
  | 'empty'
  | 'single'
  | 'linear'
  | 'tree'
  | 'dag'
  | 'cyclic'
  | 'star'
  | 'mesh'
  | 'disconnected';

export interface TopologyProfile {
  readonly shape: TopologyShape;
  readonly componentCount: number;
  readonly isCyclic: boolean;
  readonly isConnected: boolean;
  /** High-degree entity ids (the structural hubs), most-connected first. */
  readonly hubs: readonly string[];
  readonly sources: readonly string[];
  readonly sinks: readonly string[];
  readonly isolated: readonly string[];
}

export interface CountedKind {
  readonly kind: string;
  readonly count: number;
}

export interface DiagramDigest {
  readonly text: string;
  readonly counts: { readonly entities: number; readonly relationships: number; readonly groups: number };
  readonly kinds: readonly CountedKind[];
  readonly relationshipKinds: readonly CountedKind[];
  readonly topology: TopologyProfile;
}

// ── helpers ────────────────────────────────────────────────────────────────

function labelOf(graph: SemanticGraph, id: string): string {
  return graph.entities.get(id)?.label ?? graph.groups.get(id)?.label ?? id;
}

function sortedCounts(map: ReadonlyMap<string, number>): CountedKind[] {
  return [...map.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

function joinCounts(counts: readonly CountedKind[], limit = 6): string {
  const head = counts.slice(0, limit).map((c) => `${c.count} ${c.kind}${c.count === 1 ? '' : 's'}`);
  const rest = counts.length - limit;
  if (rest > 0) head.push(`${rest} more kind${rest === 1 ? '' : 's'}`);
  return head.join(', ');
}

/** Rank entities by total degree; return the top hubs above a sensible threshold. */
function hubsOf(graph: SemanticGraph, limit = 3): string[] {
  const ranked = [...graph.entities.keys()]
    .map((id) => ({ id, deg: graph.index.degree(id) }))
    .filter((e) => e.deg > 0)
    .sort((a, b) => b.deg - a.deg);
  const n = graph.entities.size;
  const threshold = Math.max(3, Math.ceil((n - 1) * 0.4));
  return ranked
    .filter((e) => e.deg >= threshold)
    .slice(0, limit)
    .map((e) => e.id);
}

// ── topology ─────────────────────────────────────────────────────────────────

export function summarizeTopology(graph: SemanticGraph): TopologyProfile {
  const n = graph.entities.size;
  const e = graph.relationships.size;
  const components = connectedComponents(graph);
  const componentCount = components.length;
  const isConnected = componentCount <= 1;
  const isCyclic = graph.stats.hasCycles;
  const src = sources(graph);
  const snk = sinks(graph);
  const iso = isolated(graph);
  const hubs = hubsOf(graph);

  let shape: TopologyShape;
  if (n === 0) shape = 'empty';
  else if (n === 1) shape = 'single';
  else if (!isConnected) shape = 'disconnected';
  else if (isCyclic) shape = 'cyclic';
  else if (graph.stats.densestEntityId && graph.stats.maxDegree >= (n - 1) * 0.6) shape = 'star';
  else if (e === n - 1 && graph.stats.maxDegree <= 2) shape = 'linear';
  else if (e === n - 1) shape = 'tree';
  else if (e > 2 * (n - 1)) shape = 'mesh';
  else shape = 'dag';

  return { shape, componentCount, isCyclic, isConnected, hubs, sources: src, sinks: snk, isolated: iso };
}

function describeTopology(graph: SemanticGraph, t: TopologyProfile): string {
  const parts: string[] = [];
  const shapeText: Record<TopologyShape, string> = {
    empty: 'empty',
    single: 'a single element',
    linear: 'a linear pipeline',
    tree: 'a tree/hierarchy',
    dag: 'an acyclic flow (DAG)',
    cyclic: 'a graph containing cycles',
    star: 'a hub-and-spoke (star) topology',
    mesh: 'a densely interconnected mesh',
    disconnected: `${t.componentCount} disconnected clusters`,
  };
  parts.push(`Topology: ${shapeText[t.shape]}.`);
  if (t.hubs.length > 0) parts.push(`Central hub${t.hubs.length > 1 ? 's' : ''}: ${t.hubs.map((h) => labelOf(graph, h)).join(', ')}.`);
  if (t.sources.length > 0 && t.sources.length <= 4) parts.push(`Entry points: ${t.sources.map((s) => labelOf(graph, s)).join(', ')}.`);
  if (t.isolated.length > 0) parts.push(`${t.isolated.length} isolated element${t.isolated.length === 1 ? '' : 's'}.`);
  return parts.join(' ');
}

// ── diagram ──────────────────────────────────────────────────────────────────

export function summarizeDiagram(graph: SemanticGraph): DiagramDigest {
  const kinds = sortedCounts(graph.index.kinds());
  const relationshipKinds = sortedCounts(relKindCounts(graph));
  const topology = summarizeTopology(graph);
  const counts = {
    entities: graph.entities.size,
    relationships: graph.relationships.size,
    groups: graph.groups.size,
  };

  const lines: string[] = [];
  if (counts.entities === 0) {
    lines.push('The diagram is empty.');
  } else {
    lines.push(
      `A diagram of ${counts.entities} element${counts.entities === 1 ? '' : 's'} and ${counts.relationships} relationship${counts.relationships === 1 ? '' : 's'}` +
        (counts.groups > 0 ? ` across ${counts.groups} group${counts.groups === 1 ? '' : 's'}.` : '.'),
    );
    lines.push(`Composition: ${joinCounts(kinds)}.`);
    if (relationshipKinds.length > 0) lines.push(`Relationships: ${joinCounts(relationshipKinds)}.`);
    lines.push(describeTopology(graph, topology));
  }

  return { text: lines.join(' '), counts, kinds, relationshipKinds, topology };
}

function relKindCounts(graph: SemanticGraph): Map<string, number> {
  const out = new Map<string, number>();
  for (const rel of graph.relationships.values()) out.set(rel.kind, (out.get(rel.kind) ?? 0) + 1);
  return out;
}

// ── entity ───────────────────────────────────────────────────────────────────

/**
 * Group an entity's relationships by kind and direction into readable phrases,
 * e.g. `dependsOn → Postgres, Redis` and `dependsOn ← API Gateway`. Arrows keep
 * the reading unambiguous without contorting verb tenses.
 */
function relationshipPhrases(graph: SemanticGraph, id: string): string[] {
  const out = new Map<string, string[]>(); // "kind →" | "kind ←" → labels
  for (const relId of graph.index.outgoing(id)) {
    const rel = graph.relationships.get(relId);
    if (rel) push(out, `${rel.kind} →`, labelOf(graph, rel.target));
  }
  for (const relId of graph.index.incoming(id)) {
    const rel = graph.relationships.get(relId);
    if (rel) push(out, `${rel.kind} ←`, labelOf(graph, rel.source));
  }
  const phrases: string[] = [];
  for (const [key, labels] of out) {
    phrases.push(`${key} ${labels.slice(0, 5).join(', ')}${labels.length > 5 ? `, +${labels.length - 5}` : ''}`);
  }
  return phrases;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function summarizeEntity(graph: SemanticGraph, id: string): string {
  const e = graph.entities.get(id);
  if (!e) return `Unknown element ${id}.`;
  const parts: string[] = [];
  parts.push(`${cap(e.kind)} "${e.label}"`);
  if (e.description) parts.push(`— ${e.description}`);
  const rels = relationshipPhrases(graph, id);
  if (rels.length > 0) parts.push(`(${rels.join('; ')})`);
  else parts.push('(no connections)');
  if (e.groupId) parts.push(`in group "${labelOf(graph, e.groupId)}"`);
  if (e.tags.length > 0) parts.push(`tags: ${e.tags.join(', ')}`);
  return parts.join(' ') + '.';
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

// ── group / selection / subgraph ───────────────────────────────────────────────

export function summarizeGroup(graph: SemanticGraph, groupId: string): string {
  const g = graph.groups.get(groupId);
  if (!g) return `Unknown group ${groupId}.`;
  const members = g.memberIds.map((m) => graph.entities.get(m)).filter((x): x is SemanticEntity => !!x);
  const kindCounts = new Map<string, number>();
  for (const m of members) kindCounts.set(m.kind, (kindCounts.get(m.kind) ?? 0) + 1);
  const parts = [`Group "${g.label}" contains ${members.length} element${members.length === 1 ? '' : 's'}`];
  if (kindCounts.size > 0) parts.push(`(${joinCounts(sortedCounts(kindCounts))})`);
  if (g.childGroupIds.length > 0) parts.push(`and ${g.childGroupIds.length} nested group${g.childGroupIds.length === 1 ? '' : 's'}`);
  return parts.join(' ') + '.';
}

export function summarizeSelection(graph: SemanticGraph, ids: readonly string[]): string {
  const entities = ids.map((id) => graph.entities.get(id)).filter((x): x is SemanticEntity => !!x);
  if (entities.length === 0) return 'Nothing is selected.';
  if (entities.length === 1) return `Selected: ${summarizeEntity(graph, entities[0]!.id)}`;
  const kindCounts = new Map<string, number>();
  for (const e of entities) kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
  const internalRels = countInternalRelationships(graph, new Set(entities.map((e) => e.id)));
  return `${entities.length} selected element${entities.length === 1 ? '' : 's'} (${joinCounts(sortedCounts(kindCounts))}), ${internalRels} relationship${internalRels === 1 ? '' : 's'} among them.`;
}

export function summarizeSubgraph(graph: SemanticGraph, ids: readonly string[]): string {
  const set = new Set(ids.filter((id) => graph.entities.has(id)));
  if (set.size === 0) return 'Empty subgraph.';
  const kindCounts = new Map<string, number>();
  for (const id of set) {
    const e = graph.entities.get(id)!;
    kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
  }
  const internal = countInternalRelationships(graph, set);
  const boundary = countBoundaryRelationships(graph, set);
  return `Subgraph of ${set.size} element${set.size === 1 ? '' : 's'} (${joinCounts(sortedCounts(kindCounts))}): ${internal} internal relationship${internal === 1 ? '' : 's'}, ${boundary} crossing the boundary.`;
}

function countInternalRelationships(graph: SemanticGraph, ids: ReadonlySet<string>): number {
  let count = 0;
  for (const rel of graph.relationships.values()) {
    if (ids.has(rel.source) && ids.has(rel.target)) count++;
  }
  return count;
}

function countBoundaryRelationships(graph: SemanticGraph, ids: ReadonlySet<string>): number {
  let count = 0;
  for (const rel of graph.relationships.values()) {
    const s = ids.has(rel.source);
    const t = ids.has(rel.target);
    if (s !== t) count++;
  }
  return count;
}
