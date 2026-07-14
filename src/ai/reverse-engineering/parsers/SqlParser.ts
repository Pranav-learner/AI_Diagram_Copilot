/**
 * SQL DDL parser — deterministic, dependency-free.
 *
 * Extracts tables (with columns, primary keys, nullability), foreign-key
 * relationships (inline `REFERENCES` and table-level / `ALTER TABLE` constraints),
 * indexes, and views. Statement-oriented (split on `;`); comments stripped.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

export const sqlParser: LanguageParser = {
  id: 'sql',
  languages: ['sql'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'sql', basename(input.path).replace(/\.sql$/, ''));
    const content = input.content.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const lineOf = (idx: number) => content.slice(0, idx).split('\n').length;

    let offset = 0;
    for (const stmt of content.split(';')) {
      const line = lineOf(offset);
      offset += stmt.length + 1;
      const s = stmt.trim();
      if (!s) continue;

      const table = /^create\s+table\s+(?:if\s+not\s+exists\s+)?["`[]?([\w.]+)["`\]]?\s*\(([\s\S]*)\)/i.exec(s);
      if (table) {
        const name = table[1]!.split('.').pop()!;
        const refs = new Set<string>();
        const tableId = b.add({ kind: 'table', name, startLine: line, metadata: { schema: table[1]!.includes('.') ? table[1]!.split('.')[0]! : 'public' } });
        for (const col of splitTopLevel(table[2]!)) {
          const c = col.trim();
          const fk = /foreign\s+key\s*\(([^)]+)\)\s*references\s+["`[]?([\w.]+)["`\]]?/i.exec(c);
          if (fk) { refs.add(fk[2]!.split('.').pop()!); continue; }
          if (/^(primary\s+key|unique|check|constraint|foreign\s+key)/i.test(c)) continue;
          const cm = /^["`[]?(\w+)["`\]]?\s+([\w()]+)/.exec(c);
          if (cm) {
            const inlineRef = /references\s+["`[]?([\w.]+)["`\]]?/i.exec(c);
            if (inlineRef) refs.add(inlineRef[1]!.split('.').pop()!);
            b.add({ kind: 'column', name: cm[1]!, startLine: line, metadata: { type: cm[2]!.toLowerCase(), nullable: !/not\s+null/i.test(c), primaryKey: /primary\s+key/i.test(c), ...(inlineRef ? { references: inlineRef[1]!.split('.').pop()! } : {}) } }, tableId);
          }
        }
        if (refs.size) b.update(tableId, { references: [...refs] });
        continue;
      }

      const view = /^create\s+(?:or\s+replace\s+)?view\s+["`[]?([\w.]+)["`\]]?/i.exec(s);
      if (view) { b.add({ kind: 'view', name: view[1]!.split('.').pop()!, startLine: line }); continue; }

      const idx = /^create\s+(?:unique\s+)?index\s+["`[]?([\w.]+)["`\]]?\s+on\s+["`[]?([\w.]+)["`\]]?\s*\(([^)]*)\)/i.exec(s);
      if (idx) { b.add({ kind: 'field', name: idx[1]!, startLine: line, metadata: { indexOn: idx[2]!.split('.').pop()!, columns: idx[3]!.split(',').map((x) => x.trim().replace(/["`[\]]/g, '')) } }); continue; }

      const alter = /^alter\s+table\s+["`[]?([\w.]+)["`\]]?[\s\S]*?foreign\s+key\s*\([^)]+\)\s*references\s+["`[]?([\w.]+)["`\]]?/i.exec(s);
      if (alter) {
        const src = alter[1]!.split('.').pop()!;
        b.add({ kind: 'resource', name: `fk:${src}->${alter[2]!.split('.').pop()!}`, startLine: line, metadata: { fkSource: src, fkTarget: alter[2]!.split('.').pop()!, kind: 'foreignKey' } });
      }
    }

    return { language: 'sql', ok: true, ast: b.build(), errors: [] };
  },
};

/** Split a parenthesised column list on top-level commas. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}
