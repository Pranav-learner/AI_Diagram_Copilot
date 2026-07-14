/**
 * ArchitectureAnalyzer — lifts the low-level graph into architecture concepts:
 * bounded contexts (top-level directories), layers (by path convention), services
 * (modules that expose endpoints), shared libraries (widely-depended-on), and
 * integration points.
 *
 * These become semantic architecture entities the Architecture/Diagram Planner will
 * later consume. Deterministic and heuristic — derived purely from paths + the graph.
 */

import type { CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';

const LAYER_RULES: ReadonlyArray<{ re: RegExp; layer: string }> = [
  { re: /(controller|routes?|handler|api|http|rest|graphql|web|endpoints?)/i, layer: 'presentation' },
  { re: /(service|usecase|use-case|application|command|query|workflow)/i, layer: 'application' },
  { re: /(repositor|dao|store|persistence|model|entity|domain|aggregate)/i, layer: 'domain' },
  { re: /(infra|config|database|db|client|adapter|gateway|external)/i, layer: 'infrastructure' },
];

const INTEGRATION_KINDS = new Set(['endpoint', 'operation', 'queue', 'cache', 'database', 'library', 'service']);

export function analyzeArchitecture(graph: CodeKnowledgeGraph, _asts?: unknown): void {
  // Dependents per entity (for shared-library detection).
  const dependents = new Map<string, number>();
  for (const r of graph.relations()) if (r.kind === 'dependsOn' || r.kind === 'imports') dependents.set(r.target, (dependents.get(r.target) ?? 0) + 1);

  const exposers = new Set<string>();
  for (const r of graph.relations()) if (r.kind === 'exposes') exposers.add(r.source);

  for (const m of graph.byKind('module')) {
    const path = m.module ?? m.name;
    // Bounded context = top-level directory.
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 1) {
      const dir = parts[0]!;
      const bcId = `bc:${dir}`;
      graph.addEntity({ id: bcId, kind: 'boundedContext', name: dir, confidence: 0.6, metadata: { kind: 'bounded-context' } });
      graph.addRelation(m.id, 'partOf', bcId, { ...(m.file ? { file: m.file } : {}) });
    }
    // Layer by path convention.
    const layer = LAYER_RULES.find((l) => l.re.test(path))?.layer;
    if (layer) {
      const layerId = `layer:${layer}`;
      graph.addEntity({ id: layerId, kind: 'layer', name: layer, confidence: 0.55, metadata: { kind: 'layer' } });
      graph.addRelation(m.id, 'partOf', layerId, { ...(m.file ? { file: m.file } : {}) });
    }
    // A module that exposes endpoints is a service.
    if (exposers.has(m.id)) graph.addEntity({ id: m.id, kind: m.kind, name: m.name, metadata: { isService: true } });
  }

  // Shared libraries / modules.
  for (const [id, count] of dependents) {
    if (count >= 3) {
      const e = graph.getEntity(id);
      if (e) graph.addEntity({ id, kind: e.kind, name: e.name, metadata: { shared: true, dependents: count } });
    }
  }

  // Integration points.
  for (const e of graph.entities()) {
    if (INTEGRATION_KINDS.has(e.kind) && (e.kind !== 'library' || e.metadata.external)) {
      graph.addEntity({ id: e.id, kind: e.kind, name: e.name, metadata: { integrationPoint: true } });
    }
  }
}
