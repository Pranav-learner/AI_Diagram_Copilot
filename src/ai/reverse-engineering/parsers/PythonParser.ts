/**
 * Python parser — indentation-based, dependency-free.
 *
 * Extracts imports, classes (base classes → inheritance), functions/methods,
 * decorators, and Flask/FastAPI-style routes (`@app.get('/x')`, `@router.post(...)`).
 * Uses an indentation stack to attribute methods to their class.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename, resolveRelative } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

const ROUTE_DEC = /^@(?:\w+)\.(get|post|put|delete|patch|route)\s*\(\s*['"]([^'"]*)['"]/;

interface ClassScope {
  readonly indent: number;
  readonly id: string;
}

export const pythonParser: LanguageParser = {
  id: 'python',
  languages: ['python'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'python', resolveRelative(input.path, `./${basename(input.path)}`).replace(/\/__init__$/, ''));
    const lines = input.content.split('\n');
    const stack: ClassScope[] = [];
    let decorators: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = i + 1;
      if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
      const indent = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();

      while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
      const cls = stack[stack.length - 1];

      // Imports.
      let m = /^import\s+(.+)$/.exec(trimmed);
      if (m) {
        for (const mod of m[1]!.split(',')) {
          const name = mod.trim().split(/\s+as\s+/)[0]!.trim().split('.')[0]!;
          b.addImport({ path: mod.trim().split(/\s+as\s+/)[0]!.trim(), names: [name], relative: false, line });
        }
        continue;
      }
      m = /^from\s+(\S+)\s+import\s+(.+)$/.exec(trimmed);
      if (m) {
        const names = m[2]!.replace(/[()]/g, '').split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
        b.addImport({ path: m[1]!, names, relative: m[1]!.startsWith('.'), line });
        continue;
      }

      // Decorators.
      if (trimmed.startsWith('@')) {
        const route = ROUTE_DEC.exec(trimmed);
        if (route) {
          const method = route[1]! === 'route' ? 'ANY' : route[1]!.toUpperCase();
          b.add({ kind: 'endpoint', name: `${method} ${route[2]! || '/'}`, startLine: line, metadata: { method, path: route[2]! || '/', framework: 'python' } }, cls?.id);
        }
        const name = /^@([\w.]+)/.exec(trimmed);
        if (name) decorators.push(name[1]!.split('.')[0]!);
        continue;
      }

      // Class.
      m = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/.exec(trimmed);
      if (m) {
        const bases = (m[2] ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'object');
        b.addExport(m[1]!);
        const id = b.add({ kind: 'class', name: m[1]!, startLine: line, ...(bases.length ? { extends: bases } : {}), ...(decorators.length ? { annotations: [...decorators] } : {}) }, cls?.id);
        stack.push({ indent, id });
        decorators = [];
        continue;
      }

      // Function / method.
      m = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/.exec(trimmed);
      if (m) {
        const isMethod = cls !== undefined && indent > cls.indent;
        const params = m[2]!.split(',').map((p) => p.split(':')[0]!.split('=')[0]!.trim()).filter((p) => p && p !== 'self' && p !== 'cls').map((name) => ({ name }));
        b.add({ kind: isMethod ? 'method' : 'function', name: m[1]!, startLine: line, params, ...(decorators.length ? { annotations: [...decorators] } : {}), ...(/^async\s/.test(trimmed) ? { modifiers: ['async'] } : {}) }, isMethod ? cls!.id : undefined);
        if (!isMethod) b.addExport(m[1]!);
        decorators = [];
        continue;
      }
      decorators = [];
    }

    return { language: 'python', ok: true, ast: b.build(), errors: [] };
  },
};
