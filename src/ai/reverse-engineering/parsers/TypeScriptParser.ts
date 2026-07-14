/**
 * TypeScript / JavaScript parser.
 *
 * A deterministic, dependency-free scanner (no `typescript` compiler at runtime) that
 * tracks brace depth + a scope stack to extract the normalized concepts: imports/
 * exports, classes (extends/implements), interfaces, enums, functions, methods,
 * decorators/annotations, framework routes (NestJS decorators + Express-style
 * `app.get(...)`), and a heuristic per-function call list. It recovers gracefully on
 * unfamiliar constructs (recorded as warnings). Not a full grammar — a pragmatic
 * static-analysis front-end, in the spirit of the Markdown parser in Module 1.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import type { Language } from '../ast/NormalizedAST';
import { basename, resolveRelative } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

const CALL_EXCLUDE = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'class', 'interface', 'new', 'typeof', 'await', 'super',
  'throw', 'do', 'else', 'yield', 'void', 'delete', 'in', 'of', 'instanceof', 'case', 'with', 'extends', 'implements',
  'import', 'export', 'const', 'let', 'var', 'type', 'enum', 'as', 'from', 'require', 'and', 'or', 'not',
]);

const HTTP_DECORATORS = /^(Get|Post|Put|Delete|Patch|Options|Head|All)$/;
const ROUTE_CALL_RE = /\b(?:app|router|api|server|route|r)\.(get|post|put|delete|patch|all|use|options|head)\s*\(\s*['"`]([^'"`]*)['"`]/g;

interface Scope {
  readonly id: string;
  readonly kind: 'class' | 'interface' | 'enum' | 'function' | 'method' | 'block';
  readonly closeDepth: number;
  readonly calls: Set<string>;
}

export const typeScriptParser: LanguageParser = {
  id: 'typescript',
  languages: ['typescript', 'javascript'],
  parse(input: ParseInput): ParseResult {
    const language: Language = input.language ?? (/\.jsx?$|\.mjs$|\.cjs$/i.test(input.path) ? 'javascript' : 'typescript');
    const moduleName = resolveRelative(input.path, `./${basename(input.path)}`);
    const b = new ASTBuilder(input.path, language, moduleName);

    const noComments = stripComments(input.content);
    const lines = noComments.split('\n');

    extractImportsExports(noComments, b);

    const stack: Scope[] = [];
    let depth = 0;
    let decorators: string[] = [];

    const enclosingClass = () => [...stack].reverse().find((s) => s.kind === 'class' || s.kind === 'interface');
    const enclosingCallable = () => [...stack].reverse().find((s) => s.kind === 'function' || s.kind === 'method');

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const code = blankStrings(raw);
      const trimmed = code.trim();
      const line = i + 1;
      const startDepth = depth;

      // Decorators (accumulate; detect routes).
      const dec = /^@([\w.]+)/.exec(trimmed);
      if (dec) {
        const name = dec[1]!.split('.')[0]!;
        decorators.push(name);
        const route = /^@(Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*['"`]([^'"`]*)/.exec(raw.trim());
        if (route && HTTP_DECORATORS.test(route[1]!)) {
          b.add({ kind: 'endpoint', name: `${route[1]!.toUpperCase()} ${route[2]! || '/'}`, startLine: line, metadata: { method: route[1]!.toUpperCase(), path: route[2]! || '/', framework: 'decorator' } }, enclosingClass()?.id);
        }
        depth += braceDelta(code);
        popClosed(b, stack, depth, line);
        continue;
      }

      const opened = detectDeclaration(trimmed, line, b, decorators, enclosingClass());
      if (opened !== 'declaration') decorators = [];

      // Express-style route calls.
      let m: RegExpExecArray | null;
      ROUTE_CALL_RE.lastIndex = 0;
      while ((m = ROUTE_CALL_RE.exec(raw)) !== null) {
        if (m[1]!.toLowerCase() === 'use') continue;
        b.add({ kind: 'endpoint', name: `${m[1]!.toUpperCase()} ${m[2]! || '/'}`, startLine: line, metadata: { method: m[1]!.toUpperCase(), path: m[2]! || '/', framework: 'router' } });
      }

      // Collect this line's call-like tokens (attributed after any scope push, so
      // one-liner bodies like `function a() { b(); }` credit `a`, not the parent).
      const lineCalls: string[] = [];
      for (const c of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) if (!CALL_EXCLUDE.has(c[1]!)) lineCalls.push(c[1]!);

      depth += braceDelta(code);
      if (opened && opened !== 'declaration') {
        if (depth > startDepth) {
          stack.push({ id: opened.id, kind: opened.kind, closeDepth: startDepth, calls: new Set() });
        } else if ((opened.kind === 'function' || opened.kind === 'method') && lineCalls.length > 0) {
          // One-liner body (`function a() { b(); }`): attach calls directly.
          b.update(opened.id, { calls: [...new Set(lineCalls)] });
        }
      }
      const callable = enclosingCallable();
      if (callable) for (const name of lineCalls) callable.calls.add(name);
      popClosed(b, stack, depth, line);
    }

    return { language, ok: true, ast: b.build(), errors: [] };
  },
};

function popClosed(b: ASTBuilder, stack: Scope[], depth: number, line: number): void {
  while (stack.length > 0 && depth <= stack[stack.length - 1]!.closeDepth) {
    const scope = stack.pop()!;
    b.update(scope.id, { endLine: line, ...(scope.calls.size ? { calls: [...scope.calls] } : {}) });
  }
}

type OpenResult = false | 'declaration' | { id: string; kind: Scope['kind'] };

function detectDeclaration(trimmed: string, line: number, b: ASTBuilder, decorators: string[], cls: Scope | undefined): OpenResult {
  const exported = /\bexport\b/.test(trimmed);
  const parentId = cls?.id;
  const ann = decorators.length ? [...decorators] : undefined;
  const mods = (extra: string[] = []) => {
    const out = extra;
    if (exported) out.push('export');
    return out.length ? out : undefined;
  };

  let m = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.]+(?:<[^>]*>)?))?(?:\s+implements\s+([\w.,\s<>]+?))?\s*\{/.exec(trimmed);
  if (m && /class\s/.test(trimmed)) {
    if (exported) b.addExport(m[1]!);
    const id = b.add({ kind: 'class', name: m[1]!, startLine: line, ...(m[2] ? { extends: [m[2]] } : {}), ...(m[3] ? { implements: splitTypes(m[3]) } : {}), ...(ann ? { annotations: ann } : {}), ...(mods() ? { modifiers: mods() } : {}) }, parentId);
    return trimmed.includes('{') ? { id, kind: 'class' } : 'declaration';
  }

  m = /^(?:export\s+)?(?:declare\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.,\s<>]+?))?\s*\{/.exec(trimmed);
  if (m) {
    if (exported) b.addExport(m[1]!);
    const id = b.add({ kind: 'interface', name: m[1]!, startLine: line, ...(m[2] ? { extends: splitTypes(m[2]) } : {}), ...(mods() ? { modifiers: mods() } : {}) }, parentId);
    return trimmed.includes('{') ? { id, kind: 'interface' } : 'declaration';
  }

  m = /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{?/.exec(trimmed);
  if (m) {
    if (exported) b.addExport(m[1]!);
    const id = b.add({ kind: 'enum', name: m[1]!, startLine: line, ...(mods() ? { modifiers: mods() } : {}) }, parentId);
    return trimmed.includes('{') ? { id, kind: 'enum' } : 'declaration';
  }

  m = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*\(/.exec(trimmed);
  if (m) {
    if (exported) b.addExport(m[1]!);
    const id = b.add({ kind: 'function', name: m[1]!, startLine: line, ...(/\basync\b/.test(trimmed) ? { modifiers: ['async', ...(exported ? ['export'] : [])] } : mods() ? { modifiers: mods() } : {}) });
    return trimmed.includes('{') ? { id, kind: 'function' } : 'declaration';
  }

  m = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=>]+)?=>|\w+\s*=>)/.exec(trimmed);
  if (m) {
    if (exported) b.addExport(m[1]!);
    const id = b.add({ kind: 'function', name: m[1]!, startLine: line, ...(mods() ? { modifiers: mods() } : {}) });
    return trimmed.includes('{') ? { id, kind: 'function' } : 'declaration';
  }

  // Method (inside a class/interface).
  if (cls && cls.kind === 'class') {
    m = /^(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+|async\s+|abstract\s+|override\s+|get\s+|set\s+)*(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?::[^{;]+)?\{?/.exec(trimmed);
    if (m && !CALL_EXCLUDE.has(m[1]!)) {
      const modifiers = (trimmed.match(/\b(public|private|protected|readonly|static|async|abstract|override)\b/g) ?? []) as string[];
      const id = b.add({ kind: 'method', name: m[1]!, startLine: line, ...(ann ? { annotations: ann } : {}), ...(modifiers.length ? { modifiers } : {}), params: parseParams(m[2]!) }, cls.id);
      return trimmed.includes('{') ? { id, kind: 'method' } : 'declaration';
    }
  }

  // Named export list: export { A, B }
  const ex = /^export\s*\{([^}]+)\}/.exec(trimmed);
  if (ex) for (const name of ex[1]!.split(',')) b.addExport(name.trim().split(/\s+as\s+/)[0]!.trim());

  return false;
}

// ── Imports / exports ──────────────────────────────────────────────────────────

function extractImportsExports(content: string, b: ASTBuilder): void {
  const lineOf = lineIndexer(content);
  // import ... from '...'
  for (const m of content.matchAll(/import\s+(?:type\s+)?([^;'"]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    b.addImport({ path: m[2]!, names: parseImportClause(m[1]!), relative: isRelative(m[2]!), line: lineOf(m.index!) });
  }
  // side-effect import '...'
  for (const m of content.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
    b.addImport({ path: m[1]!, names: [], relative: isRelative(m[1]!), line: lineOf(m.index!) });
  }
  // const x = require('...')
  for (const m of content.matchAll(/\b(?:const|let|var)\s+([^=]+?)=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    b.addImport({ path: m[2]!, names: parseImportClause(m[1]!), relative: isRelative(m[2]!), line: lineOf(m.index!) });
  }
  // export ... from '...' (re-export)
  for (const m of content.matchAll(/export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g)) {
    b.addImport({ path: m[1]!, names: [], relative: isRelative(m[1]!), line: lineOf(m.index!) });
  }
}

function parseImportClause(clause: string): string[] {
  const names: string[] = [];
  const named = /\{([^}]*)\}/.exec(clause);
  if (named) for (const n of named[1]!.split(',')) { const name = n.trim().split(/\s+as\s+/).pop()!.trim(); if (name) names.push(name); }
  const ns = /\*\s+as\s+(\w+)/.exec(clause);
  if (ns) names.push(ns[1]!);
  const def = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+\w+/, '').replace(/,/g, '').trim();
  if (def && /^\w+$/.test(def)) names.push(def);
  return names;
}

function parseParams(raw: string): { name: string; type?: string }[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((p) => {
    const [namePart, typePart] = p.split(':');
    const name = namePart!.replace(/[?.]/g, '').replace(/^(public|private|protected|readonly)\s+/, '').trim();
    return typePart ? { name, type: typePart.trim() } : { name };
  }).filter((p) => p.name);
}

function splitTypes(raw: string): string[] {
  return raw.split(',').map((t) => t.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
}

function isRelative(path: string): boolean {
  return path.startsWith('.') || path.startsWith('/');
}

// ── Lexical helpers ──────────────────────────────────────────────────────────────

function braceDelta(code: string): number {
  let d = 0;
  for (const c of code) {
    if (c === '{') d++;
    else if (c === '}') d--;
  }
  return d;
}

/** Replace string/template contents with spaces (single-line), preserving length. */
function blankStrings(line: string): string {
  return line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) => m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[0]);
}

/** Remove comments, preserving strings and newlines (for stable line numbers). */
function stripComments(content: string): string {
  let out = '';
  let i = 0;
  let str: string | null = null;
  while (i < content.length) {
    const c = content[i]!;
    const next = content[i + 1];
    if (str) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === str) str = null;
      i++;
    } else if (c === '"' || c === "'" || c === '`') {
      str = c;
      out += c;
      i++;
    } else if (c === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) { if (content[i] === '\n') out += '\n'; i++; }
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function lineIndexer(content: string): (index: number) => number {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') offsets.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
