/**
 * DependencyAnalyzer — builds the import/dependency graph between modules, and
 * models external packages as `library` entities.
 *
 * Relative imports resolve to in-repo modules (`imports` + `dependsOn`); bare
 * specifiers become libraries the module `dependsOn`. Deterministic path resolution.
 */

import type { UIRDocument } from '../uir/UIR';
import type { ImportRef } from '../ast/NormalizedAST';
import type { CodeKnowledgeGraph } from '../graph/CodeKnowledgeGraph';
import { resolveRelative } from '../util';

export function moduleId(moduleName: string): string {
  return `module:${moduleName}`;
}

/** Top-level package of a bare specifier (`@scope/pkg/x` → `@scope/pkg`, `a/b` → `a`). */
function topPackage(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

export function analyzeDependencies(graph: CodeKnowledgeGraph, docs: readonly UIRDocument[]): void {
  const codeDocs = docs.filter((d) => {
    const imports = d.metadata.imports as ImportRef[] ?? [];
    const exports = d.metadata.exports as string[] ?? [];
    return imports.length > 0 || exports.length > 0;
  });
  for (const doc of codeDocs) {
    const fromId = moduleId(doc.module);
    if (!graph.hasEntity(fromId)) continue;
    const imports = doc.metadata.imports as ImportRef[] ?? [];
    for (const imp of imports) {
      if (imp.relative) {
        const targetModule = resolveRelative(doc.file, imp.path);
        const targetId = moduleId(targetModule);
        if (!graph.hasEntity(targetId)) graph.addEntity({ id: targetId, kind: 'module', name: targetModule.split('/').pop() ?? targetModule, module: targetModule, confidence: 0.5, metadata: { unresolved: true } });
        graph.addRelation(fromId, 'imports', targetId, { file: doc.file, metadata: { names: imp.names } });
        graph.addRelation(fromId, 'dependsOn', targetId, { file: doc.file });
      } else {
        const pkg = topPackage(imp.path);
        const libId = `lib:${pkg}`;
        graph.addEntity({ id: libId, kind: 'library', name: pkg, confidence: 0.9, metadata: { external: true } });
        graph.addRelation(fromId, 'dependsOn', libId, { file: doc.file, metadata: { external: true } });
      }
    }
  }
}
