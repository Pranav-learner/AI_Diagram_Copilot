/**
 * SemanticQuery — the clean, stable read API over a Semantic Graph snapshot.
 *
 * This is the *only* surface future AI capabilities (Explain, Review, Insights,
 * Smart Import) should touch. It hides adjacency, indexes, and traversal
 * mechanics behind intent-shaped methods — `findDependencies`, `findConsumers`,
 * `findPath`, `search`, `summarize`, `extractContext`. A query object is bound to
 * one immutable graph; the {@link UnderstandingEngine} hands out a fresh one after
 * each incremental update, so callers never reason over stale structure.
 */

import type { SemanticGraph } from '../model/graph';
import type { SemanticEntity } from '../model/entity';
import type { SemanticRelationship } from '../model/relationship';
import type { SemanticGroup } from '../model/group';
import { DEPENDENCY_KINDS } from '../model/relationship';
import type { Direction, TraversalOptions } from '../analysis/traversal';
import { neighborhood, reachable } from '../analysis/traversal';
import { allSimplePaths, dependencyChains, shortestPath, type Path } from '../analysis/paths';
import { connectedComponents, findCycle, topologicalOrder } from '../analysis/components';
import { ancestors, descendants } from '../analysis/hierarchy';
import { search, type SearchHit, type SearchOptions } from '../analysis/search';
import { normLabel } from '../build/GraphIndex';
import { summarizeDiagram, summarizeEntity, summarizeGroup, summarizeSelection, summarizeSubgraph, summarizeTopology, type DiagramDigest } from '../summary/summaries';
import { extractContext, type ContextExtractOptions, type ContextScope, type ExtractedContext } from '../context/ContextExtractor';
import { validateSemanticGraph, type ValidationReport } from '../validation/validateGraph';

/** Relationship kinds that read as data production/flow (source feeds target). */
const PRODUCE_KINDS: ReadonlySet<string> = new Set(['produces', 'sends', 'triggers', 'flowsTo']);
const CONSUME_KINDS: ReadonlySet<string> = new Set(['consumes']);

export class SemanticQuery {
  constructor(readonly graph: SemanticGraph) {}

  // ── Direct lookups ──────────────────────────────────────────────────────────
  getEntity(id: string): SemanticEntity | undefined {
    return this.graph.entities.get(id);
  }
  getRelationship(id: string): SemanticRelationship | undefined {
    return this.graph.relationships.get(id);
  }
  getGroup(id: string): SemanticGroup | undefined {
    return this.graph.groups.get(id);
  }

  /** Resolve a reference by id → exact label → best fuzzy hit. */
  findEntity(idOrLabel: string): SemanticEntity | undefined {
    const byId = this.graph.entities.get(idOrLabel);
    if (byId) return byId;
    const byLabel = this.graph.index.byLabel(idOrLabel);
    if (byLabel.length > 0) return this.graph.entities.get(byLabel[0]!);
    const hit = search(this.graph, idOrLabel, { only: 'entity', limit: 1 })[0];
    return hit ? this.graph.entities.get(hit.id) : undefined;
  }

  findEntitiesByKind(kind: string): SemanticEntity[] {
    return this.graph.index.byKind(kind).map((id) => this.graph.entities.get(id)!);
  }
  findEntitiesByTag(tag: string): SemanticEntity[] {
    return this.graph.index.byTag(tag).map((id) => this.graph.entities.get(id)!);
  }

  /** Resolve a group by id → exact label → best fuzzy hit. */
  findGroup(idOrLabel: string): SemanticGroup | undefined {
    const byId = this.graph.groups.get(idOrLabel);
    if (byId) return byId;
    const target = normLabel(idOrLabel);
    for (const g of this.graph.groups.values()) if (normLabel(g.label) === target) return g;
    const hit = search(this.graph, idOrLabel, { only: 'group', limit: 1 })[0];
    return hit ? this.graph.groups.get(hit.id) : undefined;
  }

  // ── Neighbourhood & connectivity ─────────────────────────────────────────────
  findNeighbors(id: string, opts: TraversalOptions = {}): SemanticEntity[] {
    return this.resolve(neighborhoodIds(this.graph, id, opts));
  }

  findNeighborhood(id: string, radius = 1): SemanticEntity[] {
    const ids = neighborhood(this.graph, id, radius);
    ids.delete(id);
    return this.resolve([...ids]);
  }

  findReachable(from: string | readonly string[], opts: TraversalOptions = {}): SemanticEntity[] {
    return this.resolve([...reachable(this.graph, from, opts)]);
  }

  // ── Paths ─────────────────────────────────────────────────────────────────────
  findPath(from: string, to: string, opts: Pick<TraversalOptions, 'direction' | 'relKinds'> = {}): Path | null {
    return shortestPath(this.graph, from, to, opts);
  }
  findAllPaths(from: string, to: string, opts: Parameters<typeof allSimplePaths>[3] = {}): Path[] {
    return allSimplePaths(this.graph, from, to, opts);
  }

  // ── Dependencies (the DEPENDENCY_KINDS subgraph) ─────────────────────────────
  /** What `id` (directly) depends on. */
  findDependencies(id: string): SemanticEntity[] {
    return this.resolve(relatedByKinds(this.graph, id, DEPENDENCY_KINDS, 'out'));
  }
  /** What (directly) depends on `id`. */
  findDependents(id: string): SemanticEntity[] {
    return this.resolve(relatedByKinds(this.graph, id, DEPENDENCY_KINDS, 'in'));
  }
  /** Transitive dependency chains rooted at `id`. */
  findDependencyChains(id: string): string[][] {
    return dependencyChains(this.graph, id);
  }

  // ── Producers / consumers (data-flow reading) ────────────────────────────────
  /** Entities that feed `id` (produce/send/trigger into it, or it consumes from). */
  findProducers(id: string): SemanticEntity[] {
    const ids = new Set<string>([
      ...relatedByKinds(this.graph, id, PRODUCE_KINDS, 'in'),
      ...relatedByKinds(this.graph, id, CONSUME_KINDS, 'out'),
    ]);
    return this.resolve([...ids]);
  }
  /** Entities `id` feeds (produces/sends/triggers to, or that consume from it). */
  findConsumers(id: string): SemanticEntity[] {
    const ids = new Set<string>([
      ...relatedByKinds(this.graph, id, PRODUCE_KINDS, 'out'),
      ...relatedByKinds(this.graph, id, CONSUME_KINDS, 'in'),
    ]);
    return this.resolve([...ids]);
  }

  // ── Hierarchy ─────────────────────────────────────────────────────────────────
  findAncestorGroups(id: string): SemanticGroup[] {
    return ancestors(this.graph, id)
      .map((gid) => this.graph.groups.get(gid))
      .filter((g): g is SemanticGroup => !!g);
  }
  findMembers(groupId: string, deep = false): SemanticEntity[] {
    const ids = deep ? descendants(this.graph, groupId).filter((x) => this.graph.entities.has(x)) : (this.graph.groups.get(groupId)?.memberIds ?? []);
    return this.resolve(ids);
  }

  // ── Structure ─────────────────────────────────────────────────────────────────
  connectedComponents(): SemanticEntity[][] {
    return connectedComponents(this.graph).map((ids) => this.resolve(ids));
  }
  findCycle(): SemanticEntity[] | null {
    const cycle = findCycle(this.graph);
    return cycle ? this.resolve(cycle) : null;
  }
  topologicalOrder(): SemanticEntity[] | null {
    const order = topologicalOrder(this.graph);
    return order ? this.resolve(order) : null;
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  search(query: string, opts?: SearchOptions): SearchHit[] {
    return search(this.graph, query, opts);
  }

  // ── Summaries & context ───────────────────────────────────────────────────────
  digest(): DiagramDigest {
    return summarizeDiagram(this.graph);
  }
  topology() {
    return summarizeTopology(this.graph);
  }
  summarize(scope?: ContextScope): string {
    if (!scope || scope.kind === 'whole') return summarizeDiagram(this.graph).text;
    switch (scope.kind) {
      case 'entity':
        return summarizeEntity(this.graph, scope.id);
      case 'group':
        return summarizeGroup(this.graph, scope.id);
      case 'selection':
        return summarizeSelection(this.graph, scope.ids);
      case 'subgraph':
        return summarizeSubgraph(this.graph, scope.ids);
      case 'neighborhood':
        return summarizeSubgraph(this.graph, [...neighborhood(this.graph, scope.id, scope.radius ?? 1)]);
      case 'path': {
        const p = shortestPath(this.graph, scope.from, scope.to, { direction: 'both' });
        return p ? summarizeSubgraph(this.graph, p.nodes) : `No path between ${scope.from} and ${scope.to}.`;
      }
    }
  }

  extractContext(scope: ContextScope, opts?: ContextExtractOptions): ExtractedContext {
    return extractContext(this.graph, scope, opts);
  }

  validate(): ValidationReport {
    return validateSemanticGraph(this.graph);
  }

  // ── internals ─────────────────────────────────────────────────────────────────
  private resolve(ids: readonly string[]): SemanticEntity[] {
    const out: SemanticEntity[] = [];
    for (const id of ids) {
      const e = this.graph.entities.get(id);
      if (e) out.push(e);
    }
    return out;
  }
}

/** Neighbour entity ids honouring direction + optional kind filter (no radius). */
function neighborhoodIds(graph: SemanticGraph, id: string, opts: TraversalOptions): string[] {
  const direction = opts.direction ?? 'both';
  if (!opts.relKinds) {
    if (direction === 'out') return [...graph.index.successors(id)];
    if (direction === 'in') return [...graph.index.predecessors(id)];
    return [...graph.index.neighbors(id)];
  }
  return relatedByKinds(graph, id, opts.relKinds, direction);
}

/** Entity ids related to `id` by any of `kinds`, in the given direction. */
function relatedByKinds(graph: SemanticGraph, id: string, kinds: ReadonlySet<string>, direction: Direction): string[] {
  const out = new Set<string>();
  if (direction === 'out' || direction === 'both') {
    for (const relId of graph.index.outgoing(id)) {
      const rel = graph.relationships.get(relId);
      if (rel && kinds.has(rel.kind)) out.add(rel.target);
    }
  }
  if (direction === 'in' || direction === 'both') {
    for (const relId of graph.index.incoming(id)) {
      const rel = graph.relationships.get(relId);
      if (rel && kinds.has(rel.kind)) out.add(rel.source);
    }
  }
  out.delete(id);
  return [...out];
}
