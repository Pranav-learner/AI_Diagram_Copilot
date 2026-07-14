/**
 * InfrastructureAnalyzer — wires infrastructure entities together.
 *
 * Compose `depends_on` → dependsOn; Kubernetes Service selectors + Ingress backends
 * → connectsTo/routes; Terraform interpolations → dependsOn. References are resolved
 * within the same infra namespace (`infra:<language>:<name>`), keeping the wiring
 * deterministic and free of cross-language false links.
 */

import type { CodeEntity, CodeKnowledgeGraph, CodeRelationKind } from '../graph/CodeKnowledgeGraph';

const INFRA_KINDS = new Set(['service', 'container', 'deployment', 'resource', 'queue', 'cache', 'database', 'ingress', 'volume', 'secret']);

function refs(entity: CodeEntity): string[] {
  const v = entity.metadata.references;
  return Array.isArray(v) ? [...v] : [];
}

export function analyzeInfrastructure(graph: CodeKnowledgeGraph, _asts?: unknown): void {
  for (const entity of graph.entities()) {
    if (!INFRA_KINDS.has(entity.kind) || !entity.language) continue;
    const relKind: CodeRelationKind = entity.kind === 'ingress' ? 'routes' : entity.kind === 'deployment' || entity.kind === 'service' ? 'connectsTo' : 'dependsOn';
    for (const ref of refs(entity)) {
      const targetId = `infra:${entity.language}:${ref}`;
      if (graph.hasEntity(targetId) && targetId !== entity.id) graph.addRelation(entity.id, relKind, targetId, { ...(entity.file ? { file: entity.file } : {}) });
    }
  }
}
