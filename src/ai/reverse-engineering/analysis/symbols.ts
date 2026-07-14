/**
 * SymbolTable — resolves a symbol *name* (from an `extends`/`implements`/`calls`
 * reference) to a Code Knowledge Graph entity id.
 *
 * Deterministic resolution order: exact qualified name → unique simple name →
 * simple name within the same module → first match. This is the (necessarily
 * heuristic) name resolution a lightweight static analyzer performs without a full
 * type checker.
 */

import type { CodeEntity, CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';

export class SymbolTable {
  private readonly byName = new Map<string, string[]>();
  private readonly byQualified = new Map<string, string>();
  private readonly moduleOf = new Map<string, string>();

  static build(graph: CodeKnowledgeGraph): SymbolTable {
    const t = new SymbolTable();
    for (const e of graph.entities()) t.add(e);
    return t;
  }

  private add(e: CodeEntity): void {
    const bucket = this.byName.get(e.name);
    if (bucket) bucket.push(e.id);
    else this.byName.set(e.name, [e.id]);
    if (e.qualifiedName) this.byQualified.set(e.qualifiedName, e.id);
    if (e.module) this.moduleOf.set(e.id, e.module);
  }

  /** Resolve a symbol name to an entity id, preferring the same module. */
  resolve(name: string, fromModule?: string): string | undefined {
    const bare = name.replace(/<.*>/, '').replace(/\[\]$/, '').trim();
    if (this.byQualified.has(bare)) return this.byQualified.get(bare);
    const simple = bare.split('.').pop()!;
    const ids = this.byName.get(simple) ?? this.byName.get(bare);
    if (!ids || ids.length === 0) return undefined;
    if (ids.length === 1) return ids[0];
    if (fromModule) {
      const same = ids.find((id) => this.moduleOf.get(id) === fromModule);
      if (same) return same;
    }
    return ids[0];
  }
}
