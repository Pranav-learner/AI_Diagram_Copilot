/**
 * Java parser — brace-aware, dependency-free.
 *
 * Extracts the package, imports, classes/interfaces/enums (extends/implements),
 * annotations, methods, and Spring-style routes (`@RequestMapping`, `@GetMapping`).
 * Heuristic method detection (return-type + name + params) inside class scopes.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'synchronized', 'try']);
const HTTP_MAP: Readonly<Record<string, string>> = { GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT', DeleteMapping: 'DELETE', PatchMapping: 'PATCH' };

interface Scope { readonly id: string; readonly kind: 'class' | 'interface' | 'enum'; readonly closeDepth: number; }

export const javaParser: LanguageParser = {
  id: 'java',
  languages: ['java'],
  parse(input: ParseInput): ParseResult {
    const pkg = /^package\s+([\w.]+)\s*;/m.exec(input.content)?.[1] ?? '';
    const b = new ASTBuilder(input.path, 'java', pkg || basename(input.path).replace(/\.java$/, ''));
    if (pkg) b.setMeta('package', pkg);
    const lines = input.content.split('\n');
    const stack: Scope[] = [];
    let depth = 0;
    let annotations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.replace(/\/\/.*$/, '').trim();
      const line = i + 1;
      const startDepth = depth;
      if (!trimmed) continue;

      const im = /^import\s+(?:static\s+)?([\w.*]+)\s*;/.exec(trimmed);
      if (im) { b.addImport({ path: im[1]!, names: [im[1]!.split('.').pop()!], relative: false, line }); continue; }

      if (trimmed.startsWith('@')) {
        const ann = /^@(\w+)/.exec(trimmed)!;
        annotations.push(ann[1]!);
        const map = HTTP_MAP[ann[1]!];
        const path = /\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]/.exec(trimmed)?.[1] ?? /\(\s*['"]([^'"]*)['"]/.exec(trimmed)?.[1];
        if (map || ann[1]! === 'RequestMapping') {
          b.add({ kind: 'endpoint', name: `${map ?? 'ANY'} ${path ?? '/'}`, startLine: line, metadata: { method: map ?? 'ANY', path: path ?? '/', framework: 'spring' } }, stack[stack.length - 1]?.id);
        }
        continue;
      }

      const cls = /^(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+)*\b(class|interface|enum)\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.<>, ]+?))?(?:\s+implements\s+([\w.<>, ]+?))?\s*\{/.exec(trimmed);
      if (cls) {
        b.addExport(cls[2]!);
        const id = b.add({ kind: cls[1]! as 'class', name: cls[2]!, qualifiedName: pkg ? `${pkg}.${cls[2]!}` : cls[2]!, startLine: line, ...(cls[3] ? { extends: splitTypes(cls[3]) } : {}), ...(cls[4] ? { implements: splitTypes(cls[4]) } : {}), ...(annotations.length ? { annotations: [...annotations] } : {}), modifiers: ['export'] }, stack[stack.length - 1]?.id);
        annotations = [];
        depth += brace(trimmed);
        if (depth > startDepth) stack.push({ id, kind: cls[1]! as 'class', closeDepth: startDepth });
        popClosed(stack, depth);
        continue;
      }

      // Method inside a class.
      const top = stack[stack.length - 1];
      if (top && top.kind !== 'enum') {
        const m = /^(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+|synchronized\s+|native\s+|default\s+)*[\w.<>[\], ]+?\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w., ]+)?\s*\{?/.exec(trimmed);
        if (m && !KW.has(m[1]!) && !/^(class|interface|enum)$/.test(m[1]!)) {
          b.add({ kind: 'method', name: m[1]!, startLine: line, params: params(m[2]!), ...(annotations.length ? { annotations: [...annotations] } : {}) }, top.id);
          annotations = [];
        }
      }
      annotations = [];
      depth += brace(trimmed);
      popClosed(stack, depth);
    }

    return { language: 'java', ok: true, ast: b.build(), errors: [] };
  },
};

function popClosed(stack: Scope[], depth: number): void {
  while (stack.length > 0 && depth <= stack[stack.length - 1]!.closeDepth) stack.pop();
}
function brace(s: string): number {
  let d = 0;
  for (const c of s) { if (c === '{') d++; else if (c === '}') d--; }
  return d;
}
function splitTypes(raw: string): string[] {
  return raw.split(',').map((t) => t.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
}
function params(raw: string): { name: string; type?: string }[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((p) => {
    const parts = p.trim().replace(/@\w+\s*/g, '').split(/\s+/);
    return parts.length >= 2 ? { name: parts.pop()!, type: parts.join(' ') } : { name: parts[0] ?? '' };
  }).filter((p) => p.name);
}
