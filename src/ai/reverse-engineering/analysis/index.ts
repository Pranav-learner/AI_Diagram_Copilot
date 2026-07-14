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

import type { AstMetaValue, AstNode, NormalizedAST } from '../ast/NormalizedAST';
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

/** Build the full Code Knowledge Graph from a set of normalized ASTs. */
export function buildCodeKnowledgeGraph(asts: readonly NormalizedAST[]): CodeKnowledgeGraph {
  const graph = new CodeKnowledgeGraph();
  for (const ast of asts) projectAst(graph, ast);
  const symbols = SymbolTable.build(graph);
  analyzeDependencies(graph, asts);
  analyzeInheritance(graph, symbols);
  analyzeCallGraph(graph, symbols);
  analyzeInfrastructure(graph);
  analyzeDatabase(graph);
  analyzeApi(graph);
  analyzeArchitecture(graph);
  return graph;
}

function projectAst(graph: CodeKnowledgeGraph, ast: NormalizedAST): void {
  let moduleEntityId: string | undefined;
  if (CODE_LANGS.has(ast.language)) {
    moduleEntityId = graph.addEntity({ id: `module:${ast.module}`, kind: 'module', name: ast.module.split('/').pop() ?? ast.module, module: ast.module, file: ast.file, language: ast.language, metadata: { exports: ast.exports } });
  }
  for (const rootId of ast.rootIds) projectNode(graph, ast, rootId, moduleEntityId, undefined);
}

function projectNode(graph: CodeKnowledgeGraph, ast: NormalizedAST, nodeId: string, parentEntityId: string | undefined, parentQn: string | undefined): void {
  const node = ast.nodes.get(nodeId);
  if (!node) return;
  const { id, qualifiedName } = entityIdFor(ast, node, parentQn);
  const metadata: Record<string, AstMetaValue> = { ...(node.metadata ?? {}) };
  if (node.extends) metadata.extends = node.extends;
  if (node.implements) metadata.implements = node.implements;
  if (node.references) metadata.references = node.references;
  if (node.calls) metadata.calls = node.calls;
  if (node.annotations) metadata.annotations = node.annotations;

  const entityId = graph.addEntity({
    id,
    kind: node.kind,
    name: node.name,
    ...(qualifiedName ? { qualifiedName } : {}),
    ...(CODE_LANGS.has(ast.language) ? { module: ast.module } : {}),
    file: ast.file,
    language: ast.language,
    source: node.source,
    ...(node.modifiers ? { modifiers: node.modifiers } : {}),
    metadata,
  });
  if (parentEntityId) graph.addRelation(parentEntityId, 'contains', entityId, { file: ast.file });
  for (const childId of node.childIds ?? []) projectNode(graph, ast, childId, entityId, qualifiedName ?? node.name);
}

function entityIdFor(ast: NormalizedAST, node: AstNode, parentQn: string | undefined): { id: string; qualifiedName?: string } {
  const kind = node.kind;
  if (kind === 'endpoint') {
    const method = String(node.metadata?.method ?? 'ANY');
    const path = String(node.metadata?.path ?? node.name);
    return { id: `endpoint:${method}:${path}`, qualifiedName: `${method} ${path}` };
  }
  if (INFRA_KINDS.has(kind)) return { id: `infra:${ast.language}:${node.name}`, qualifiedName: node.name };
  if (kind === 'table') return { id: `table:${node.name}`, qualifiedName: node.name };
  if (kind === 'view') return { id: `view:${node.name}`, qualifiedName: node.name };
  if (kind === 'column') return { id: `column:${parentQn}.${node.name}`, qualifiedName: `${parentQn}.${node.name}` };
  if (API_KINDS.has(kind) || (!CODE_LANGS.has(ast.language) && (kind === 'enum' || kind === 'type'))) return { id: `${kind}:${node.name}`, qualifiedName: node.name };
  // Code symbols (class/interface/enum/struct/function/method/variable/field/type).
  const qn = node.qualifiedName ?? (parentQn ? `${parentQn}.${node.name}` : `${ast.module}.${node.name}`);
  return { id: `sym:${qn}`, qualifiedName: qn };
}
