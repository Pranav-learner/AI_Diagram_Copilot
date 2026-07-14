/**
 * CallGraphAnalyzer — resolves the heuristic call lists captured per function/method
 * into `calls` relations, and resolves `extends`/`implements`/`references` names into
 * inheritance/composition relations.
 *
 * Name resolution goes through the {@link SymbolTable} (same-module preferred). It is
 * intentionally conservative — only edges between known entities are added.
 */

import type { CodeEntity, CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';
import { SymbolTable } from './symbols';

function names(entity: CodeEntity, key: string): string[] {
  const v = entity.metadata[key];
  return Array.isArray(v) ? [...v] : [];
}

export function analyzeCallGraph(graph: CodeKnowledgeGraph, symbols: SymbolTable): void {
  for (const entity of graph.entities()) {
    if (entity.kind !== 'function' && entity.kind !== 'method') continue;
    for (const call of names(entity, 'calls')) {
      const targetId = symbols.resolve(call, entity.module);
      if (!targetId || targetId === entity.id) continue;
      const target = graph.getEntity(targetId);
      if (target && (target.kind === 'function' || target.kind === 'method')) {
        graph.addRelation(entity.id, 'calls', targetId, { ...(entity.file ? { file: entity.file } : {}) });
      }
    }
  }
}

const TYPE_KINDS = new Set(['class', 'interface', 'struct', 'enum', 'type', 'schema']);

/** Resolve extends/implements/references (composition) into typed relations. */
export function analyzeInheritance(graph: CodeKnowledgeGraph, symbols: SymbolTable): void {
  for (const entity of graph.entities()) {
    if (!TYPE_KINDS.has(entity.kind)) continue;
    const file = entity.file ? { file: entity.file } : {};
    for (const name of names(entity, 'extends')) {
      const id = symbols.resolve(name, entity.module);
      if (id) graph.addRelation(entity.id, 'extends', id, file);
    }
    for (const name of names(entity, 'implements')) {
      const id = symbols.resolve(name, entity.module);
      if (id) graph.addRelation(entity.id, 'implements', id, file);
    }
    for (const name of names(entity, 'references')) {
      const id = symbols.resolve(name, entity.module);
      if (id && id !== entity.id) graph.addRelation(entity.id, entity.kind === 'struct' || entity.kind === 'class' ? 'composedOf' : 'references', id, file);
    }
  }
}
