/**
 * Static analysis — projects the normalized ASTs into the Code Knowledge Graph and
 * runs the deterministic analyzers over it.
 *
 *   ASTs → project (entities + containment) → dependency / inheritance / call-graph /
 *   infrastructure / database / api / architecture analyzers → CodeKnowledgeGraph
 *
 * Every stage is pure and deterministic (no LLM). This is the "static analysis
 * platform" core the spec asks for.
 */

import type { AstMetaValue, NormalizedAST } from '../ast/NormalizedAST';
import { astToUIR } from '../uir/UIR';
import type { UIRDocument, UIREntity } from '../uir/UIR';
import { CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';
import { SymbolTable } from './symbols';
import { analyzeDependencies } from './DependencyAnalyzer';
import { analyzeCallGraph, analyzeInheritance } from './CallGraphAnalyzer';
import { analyzeInfrastructure } from './InfrastructureAnalyzer';
import { analyzeDatabase } from './DatabaseAnalyzer';
import { analyzeApi } from './ApiAnalyzer';
import { analyzeArchitecture } from './ArchitectureAnalyzer';

export * from './symbols';
export { analyzeDependencies, moduleId } from './DependencyAnalyzer';
export { analyzeCallGraph, analyzeInheritance } from './CallGraphAnalyzer';
export { analyzeInfrastructure } from './InfrastructureAnalyzer';
export { analyzeDatabase } from './DatabaseAnalyzer';
export { analyzeApi } from './ApiAnalyzer';
export { analyzeArchitecture } from './ArchitectureAnalyzer';

const CODE_LANGS = new Set(['typescript', 'javascript', 'python', 'go', 'java']);
const INFRA_KINDS = new Set(['service', 'container', 'deployment', 'resource', 'queue', 'cache', 'database', 'ingress', 'volume', 'secret']);
const API_KINDS = new Set(['schema', 'operation']);

/** Build the full Code Knowledge Graph from a set of UIR documents or legacy ASTs. */
export function buildCodeKnowledgeGraph(docs: readonly (UIRDocument | NormalizedAST)[]): CodeKnowledgeGraph {
  const graph = new CodeKnowledgeGraph();
  const uirDocs = docs.map((d) => ('nodes' in d ? astToUIR(d) : d));
  for (const doc of uirDocs) projectUir(graph, doc);
  const symbols = SymbolTable.build(graph);
  analyzeDependencies(graph, uirDocs);
  analyzeInheritance(graph, symbols);
  analyzeCallGraph(graph, symbols);
  analyzeInfrastructure(graph);
  analyzeDatabase(graph);
  analyzeApi(graph);
  analyzeArchitecture(graph);
  return graph;
}

function projectUir(graph: CodeKnowledgeGraph, doc: UIRDocument): void {
  let moduleEntityId: string | undefined;
  if (CODE_LANGS.has(doc.language)) {
    const exports = doc.metadata.exports as string[] ?? [];
    moduleEntityId = graph.addEntity({ id: `module:${doc.module}`, kind: 'module', name: doc.module.split('/').pop() ?? doc.module, module: doc.module, file: doc.file, language: doc.language, metadata: { exports } });
  }

  for (const entity of doc.entities) {
    const { id, qualifiedName } = uirEntityIdFor(doc, entity);
    graph.addEntity({
      id,
      kind: entity.kind as any,
      name: entity.name,
      ...(qualifiedName ? { qualifiedName } : {}),
      ...(CODE_LANGS.has(doc.language) ? { module: doc.module } : {}),
      file: doc.file,
      language: doc.language,
      source: entity.reference,
      ...(entity.metadata.modifiers ? { modifiers: entity.metadata.modifiers } : {}),
      metadata: entity.metadata,
    });
  }

  for (const rel of doc.relationships) {
    if (rel.kind === 'contains') {
      const srcEntity = doc.entities.find((e) => e.id === rel.sourceId);
      const tgtEntity = doc.entities.find((e) => e.id === rel.targetId);
      if (srcEntity && tgtEntity) {
        const srcGraphId = uirEntityIdFor(doc, srcEntity).id;
        const tgtGraphId = uirEntityIdFor(doc, tgtEntity).id;
        graph.addRelation(srcGraphId, 'contains', tgtGraphId, { file: doc.file });
      }
    }
  }

  if (moduleEntityId) {
    const childIds = new Set(doc.relationships.filter((r) => r.kind === 'contains').map((r) => r.targetId));
    for (const entity of doc.entities) {
      if (!childIds.has(entity.id)) {
        const graphId = uirEntityIdFor(doc, entity).id;
        graph.addRelation(moduleEntityId, 'contains', graphId, { file: doc.file });
      }
    }
  }
}

function uirEntityIdFor(doc: UIRDocument, entity: UIREntity): { id: string; qualifiedName?: string } {
  const kind = entity.kind;
  if (kind === 'endpoint') {
    const method = String(entity.metadata?.method ?? 'ANY');
    const path = String(entity.metadata?.path ?? entity.name);
    return { id: `endpoint:${method}:${path}`, qualifiedName: `${method} ${path}` };
  }
  if (INFRA_KINDS.has(kind)) return { id: `infra:${doc.language}:${entity.name}`, qualifiedName: entity.name };
  if (kind === 'table') return { id: `table:${entity.name}`, qualifiedName: entity.name };
  if (kind === 'view') return { id: `view:${entity.name}`, qualifiedName: entity.name };
  if (kind === 'column') {
    let parentQn = '';
    const parentRel = doc.relationships.find((r) => r.kind === 'contains' && r.targetId === entity.id);
    if (parentRel) {
      const parent = doc.entities.find((e) => e.id === parentRel.sourceId);
      if (parent) {
        const parentRes = uirEntityIdFor(doc, parent);
        parentQn = parentRes.qualifiedName ?? parent.name;
      }
    }
    return { id: `column:${parentQn}.${entity.name}`, qualifiedName: `${parentQn}.${entity.name}` };
  }
  if (API_KINDS.has(kind) || (!CODE_LANGS.has(doc.language) && (kind === 'enum' || kind === 'type'))) return { id: `${kind}:${entity.name}`, qualifiedName: entity.name };
  
  let parentQn: string | undefined;
  const parentRel = doc.relationships.find((r) => r.kind === 'contains' && r.targetId === entity.id);
  if (parentRel) {
    const parent = doc.entities.find((e) => e.id === parentRel.sourceId);
    if (parent) {
      const parentRes = uirEntityIdFor(doc, parent);
      parentQn = parentRes.qualifiedName ?? parent.name;
    }
  }
  const qn = entity.qualifiedName ?? (parentQn ? `${parentQn}.${entity.name}` : `${doc.module}.${entity.name}`);
  return { id: `sym:${qn}`, qualifiedName: qn };
}
