/**
 * ApiAnalyzer — connects endpoints/operations to the module that exposes them and to
 * the request/response schemas they reference.
 *
 * The enclosing module (by file) `exposes` its endpoints; endpoints `references` the
 * schema/type entities named in their spec (`$ref`, GraphQL field types).
 */

import type { CodeEntity, CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';

export function analyzeApi(graph: CodeKnowledgeGraph, _asts?: unknown): void {
  const moduleByFile = new Map<string, string>();
  for (const m of graph.byKind('module')) if (m.file) moduleByFile.set(m.file, m.id);

  const schemaByName = new Map<string, string>();
  for (const s of [...graph.byKind('schema'), ...graph.byKind('type')]) schemaByName.set(s.name.toLowerCase(), s.id);

  for (const ep of [...graph.byKind('endpoint'), ...graph.byKind('operation')]) {
    if (ep.file && moduleByFile.has(ep.file)) graph.addRelation(moduleByFile.get(ep.file)!, 'exposes', ep.id, { file: ep.file });
    for (const ref of arr(ep.metadata.references)) {
      const sid = schemaByName.get(ref.toLowerCase());
      if (sid) graph.addRelation(ep.id, 'references', sid);
    }
  }
}

function arr(v: CodeEntity['metadata'][string] | undefined): string[] {
  return Array.isArray(v) ? [...v] : [];
}
