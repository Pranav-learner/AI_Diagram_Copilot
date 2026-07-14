/**
 * Go parser — brace-aware, dependency-free.
 *
 * Extracts the package, imports (single + grouped), structs (with embedded types →
 * composition), interfaces, functions, and methods (receiver → owning struct).
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

export const goParser: LanguageParser = {
  id: 'go',
  languages: ['go'],
  parse(input: ParseInput): ParseResult {
    const lines = input.content.split('\n');
    const pkg = /^package\s+(\w+)/m.exec(input.content)?.[1] ?? basename(input.path).replace(/\.go$/, '');
    const b = new ASTBuilder(input.path, 'go', pkg);
    b.setMeta('package', pkg);

    let inImportBlock = false;
    let openStruct: { id: string; depth: number } | undefined;
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const trimmed = raw.replace(/\/\/.*$/, '').trim();
      const line = i + 1;

      if (inImportBlock) {
        if (trimmed === ')') { inImportBlock = false; continue; }
        const im = /^(?:\w+\s+)?"([^"]+)"/.exec(trimmed);
        if (im) b.addImport({ path: im[1]!, names: [], relative: false, line });
        continue;
      }
      if (/^import\s+\($/.test(trimmed)) { inImportBlock = true; continue; }
      const single = /^import\s+(?:\w+\s+)?"([^"]+)"/.exec(trimmed);
      if (single) { b.addImport({ path: single[1]!, names: [], relative: false, line }); continue; }

      // Struct / interface.
      let m = /^type\s+(\w+)\s+struct\s*\{?/.exec(trimmed);
      if (m) {
        const id = b.add({ kind: 'struct', name: m[1]!, qualifiedName: `${pkg}.${m[1]!}`, startLine: line, modifiers: /^[A-Z]/.test(m[1]!) ? ['export'] : [] });
        if (trimmed.includes('{')) openStruct = { id, depth };
        depth += brace(trimmed);
        continue;
      }
      m = /^type\s+(\w+)\s+interface\s*\{?/.exec(trimmed);
      if (m) {
        b.add({ kind: 'interface', name: m[1]!, qualifiedName: `${pkg}.${m[1]!}`, startLine: line, modifiers: /^[A-Z]/.test(m[1]!) ? ['export'] : [] });
        depth += brace(trimmed);
        continue;
      }

      // Embedded type inside a struct → composition.
      if (openStruct && depth === openStruct.depth + 1) {
        const embed = /^([A-Z]\w+)\s*$/.exec(trimmed);
        if (embed) b.update(openStruct.id, { references: [embed[1]!] });
      }

      // Method: func (r *T) Name(...) or func (r T) Name(...)
      m = /^func\s*\(\s*\w+\s+\*?(\w+)\s*\)\s*(\w+)\s*\(([^)]*)\)/.exec(trimmed);
      if (m) {
        b.add({ kind: 'method', name: m[2]!, qualifiedName: `${pkg}.${m[1]!}.${m[2]!}`, startLine: line, metadata: { receiver: m[1]! }, params: params(m[3]!), modifiers: /^[A-Z]/.test(m[2]!) ? ['export'] : [] });
        depth += brace(trimmed);
        continue;
      }
      // Function.
      m = /^func\s+(\w+)\s*\(([^)]*)\)/.exec(trimmed);
      if (m) {
        b.add({ kind: 'function', name: m[1]!, qualifiedName: `${pkg}.${m[1]!}`, startLine: line, params: params(m[2]!), modifiers: /^[A-Z]/.test(m[1]!) ? ['export'] : [] });
        depth += brace(trimmed);
        continue;
      }

      depth += brace(trimmed);
      if (openStruct && depth <= openStruct.depth) openStruct = undefined;
    }

    return { language: 'go', ok: true, ast: b.build(), errors: [] };
  },
};

function brace(s: string): number {
  let d = 0;
  for (const c of s) { if (c === '{') d++; else if (c === '}') d--; }
  return d;
}

function params(raw: string): { name: string; type?: string }[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((p) => {
    const parts = p.trim().split(/\s+/);
    return parts.length >= 2 ? { name: parts[0]!, type: parts.slice(1).join(' ') } : { name: parts[0] ?? '' };
  }).filter((p) => p.name);
}
