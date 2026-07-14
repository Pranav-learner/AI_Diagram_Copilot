/**
 * DatabaseAnalyzer — resolves foreign-key relationships between tables and links
 * data-access code to the tables it uses.
 *
 * Table `references` (inline + `ALTER TABLE` FK resources) become `references`
 * relations; repository/DAO/model classes whose name matches a table become
 * `readsFrom` edges (a conservative heuristic).
 */

import type { CodeEntity, CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';

const ACCESS_RE = /repository|repo|dao|store|model|entity|mapper|gateway/i;

export function analyzeDatabase(graph: CodeKnowledgeGraph, _asts?: unknown): void {
  const tables = graph.byKind('table');
  const tableByName = new Map(tables.map((t) => [t.name.toLowerCase(), t.id]));

  // Foreign keys declared on tables.
  for (const table of tables) {
    for (const ref of arr(table.metadata.references)) {
      const targetId = tableByName.get(ref.toLowerCase());
      if (targetId && targetId !== table.id) graph.addRelation(table.id, 'references', targetId, { metadata: { kind: 'foreignKey' } });
    }
  }
  // ALTER TABLE / standalone FK resources.
  for (const fk of graph.byKind('resource')) {
    if (fk.metadata.kind !== 'foreignKey') continue;
    const src = tableByName.get(String(fk.metadata.fkSource ?? '').toLowerCase());
    const tgt = tableByName.get(String(fk.metadata.fkTarget ?? '').toLowerCase());
    if (src && tgt) graph.addRelation(src, 'references', tgt, { metadata: { kind: 'foreignKey' } });
  }

  // Data-access classes → tables (heuristic).
  if (tables.length > 0) {
    for (const cls of [...graph.byKind('class'), ...graph.byKind('struct')]) {
      if (!ACCESS_RE.test(cls.name)) continue;
      const base = cls.name.toLowerCase().replace(ACCESS_RE, '').replace(/s$/, '');
      for (const [tname, tid] of tableByName) {
        if (base && (tname.startsWith(base) || base.startsWith(tname.replace(/s$/, '')))) graph.addRelation(cls.id, 'readsFrom', tid, { ...(cls.file ? { file: cls.file } : {}) });
      }
    }
  }
}

function arr(v: CodeEntity['metadata'][string] | undefined): string[] {
  return Array.isArray(v) ? [...v] : [];
}
