import { describe, it, expect } from 'vitest';
import { makeArchitecture, makeModel } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { bfs, dfs, neighborhood, reachable } from '../analysis/traversal';
import { allSimplePaths, dependencyChains, isReachable, shortestPath } from '../analysis/paths';
import { connectedComponents, findCycle, isolated, sinks, sources, topologicalOrder } from '../analysis/components';
import { ancestors, commonAncestor, descendants, groupEntitiesDeep } from '../analysis/hierarchy';
import { search } from '../analysis/search';

describe('traversal', () => {
  it('bfs records order, depth, and parents (outgoing)', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const r = bfs(graph, ids.user);
    expect(r.order[0]).toBe(ids.user);
    expect(r.depth.get(ids.gateway)).toBe(1);
    expect(r.depth.get(ids.svcA)).toBe(2);
    expect(r.depth.get(ids.db)).toBe(3);
    expect(r.parent.get(ids.gateway)).toBe(ids.user);
  });

  it('respects maxDepth', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const r = bfs(graph, ids.user, { maxDepth: 1 });
    expect(new Set(r.order)).toEqual(new Set([ids.user, ids.gateway]));
  });

  it('follows incoming direction', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const r = reachable(graph, ids.db, { direction: 'in' });
    expect(r).toContain(ids.svcA);
    expect(r).toContain(ids.gateway);
    expect(r).toContain(ids.user);
    expect(r.has(ids.cache)).toBe(false);
  });

  it('dfs visits every reachable node', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const r = dfs(graph, ids.user);
    expect(new Set(r.order).size).toBe(6);
  });

  it('neighborhood is k-hop and undirected by default', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const hood = neighborhood(graph, ids.gateway, 1);
    expect(hood).toEqual(new Set([ids.gateway, ids.user, ids.svcA, ids.svcB]));
  });

  it('filters by relationship kind', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    // Only dependsOn edges — the user→gateway edge is flowsTo, so unreachable.
    const r = reachable(graph, ids.gateway, { direction: 'out', relKinds: new Set(['dependsOn']) });
    expect(r).toContain(ids.svcA);
    expect(r.has(ids.user)).toBe(false);
  });
});

describe('paths', () => {
  it('finds the shortest path with relationship ids', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const path = shortestPath(graph, ids.user, ids.db)!;
    expect(path.nodes[0]).toBe(ids.user);
    expect(path.nodes[path.nodes.length - 1]).toBe(ids.db);
    expect(path.length).toBe(path.nodes.length - 1);
    expect(path.relationships).toHaveLength(path.length);
  });

  it('returns null when unreachable', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    expect(shortestPath(graph, ids.db, ids.user)).toBeNull();
    expect(isReachable(graph, ids.db, ids.user)).toBe(false);
    expect(isReachable(graph, ids.user, ids.db)).toBe(true);
  });

  it('enumerates simple paths up to a cap', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const paths = allSimplePaths(graph, ids.gateway, ids.db);
    // gateway→svcA→db and gateway→svcB→db
    expect(paths.length).toBe(2);
  });

  it('builds dependency chains over DEPENDENCY_KINDS only', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const chains = dependencyChains(graph, ids.gateway);
    expect(chains.every((c) => c[0] === ids.gateway)).toBe(true);
    expect(chains.some((c) => c.includes(ids.db))).toBe(true);
  });
});

describe('components & structure', () => {
  it('finds a single connected component', () => {
    const { model } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const comps = connectedComponents(graph);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toHaveLength(6);
  });

  it('separates disconnected clusters', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape' });
    const b = model.createNode({ type: 'shape' });
    model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id } });
    model.createNode({ type: 'shape' }); // isolated
    const graph = buildSemanticGraph(model.document);
    expect(connectedComponents(graph)).toHaveLength(2);
    expect(isolated(graph)).toHaveLength(1);
  });

  it('identifies sources and sinks', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    expect(sources(graph)).toEqual([ids.user]);
    expect(new Set(sinks(graph))).toEqual(new Set([ids.db, ids.cache]));
  });

  it('produces a topological order for a DAG and null for a cycle', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const order = topologicalOrder(graph)!;
    expect(order).toHaveLength(6);
    expect(order.indexOf(ids.user)).toBeLessThan(order.indexOf(ids.gateway));
    expect(order.indexOf(ids.svcA)).toBeLessThan(order.indexOf(ids.db));

    const cyc = makeModel();
    const x = cyc.createNode({ type: 'shape' });
    const y = cyc.createNode({ type: 'shape' });
    cyc.createEdge({ source: { nodeId: x.id }, target: { nodeId: y.id } });
    cyc.createEdge({ source: { nodeId: y.id }, target: { nodeId: x.id } });
    const cg = buildSemanticGraph(cyc.document);
    expect(topologicalOrder(cg)).toBeNull();
    expect(findCycle(cg)).not.toBeNull();
  });
});

describe('hierarchy', () => {
  it('walks ancestors and descendants of a group', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    expect(ancestors(graph, ids.svcA)).toEqual([ids.backend]);
    expect(new Set(descendants(graph, ids.backend))).toEqual(new Set([ids.svcA, ids.svcB, ids.db, ids.cache]));
    expect(new Set(groupEntitiesDeep(graph, ids.backend)).size).toBe(4);
  });

  it('finds a common ancestor group', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    expect(commonAncestor(graph, ids.svcA, ids.db)).toBe(ids.backend);
    expect(commonAncestor(graph, ids.user, ids.svcA)).toBeUndefined();
  });
});

describe('search', () => {
  it('ranks entities by field-weighted relevance', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    const hits = search(graph, 'orders');
    expect(hits[0]!.id).toBe(ids.svcA);
    expect(hits[0]!.matchedOn).toContain('label');
  });

  it('matches on kind and tags', () => {
    const { model, ids } = makeArchitecture();
    const graph = buildSemanticGraph(model.document);
    expect(search(graph, 'database').map((h) => h.id)).toContain(ids.db);
    expect(search(graph, 'public').map((h) => h.id)).toContain(ids.svcA);
  });
});
