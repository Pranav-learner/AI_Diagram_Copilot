/**
 * GraphQL SDL parser — types, interfaces, inputs, enums, scalars, unions, and the
 * Query/Mutation/Subscription operations.
 *
 * Object/interface/input types become `schema` nodes with their fields; the root
 * operation types' fields become `operation` nodes. Field type references (with `!`
 * and `[]` stripped) are recorded for the analyzer.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

const ROOT = new Set(['Query', 'Mutation', 'Subscription']);
const SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

export const graphqlParser: LanguageParser = {
  id: 'graphql',
  languages: ['graphql'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'graphql', basename(input.path).replace(/\.(graphql|gql)$/, ''));
    const content = input.content.replace(/#.*$/gm, '');
    const lineOf = (idx: number) => content.slice(0, idx).split('\n').length;

    for (const m of content.matchAll(/\b(type|interface|input)\s+(\w+)(?:\s+implements\s+([\w\s&]+?))?\s*\{([\s\S]*?)\}/g)) {
      const [, , name, impl, body] = m;
      const fields = parseFields(body!);
      const refs = [...new Set(fields.flatMap((f) => f.types))];
      if (ROOT.has(name!)) {
        const parentRefs = new Set<string>();
        for (const f of fields) {
          f.types.forEach((t) => parentRefs.add(t));
          b.add({ kind: 'operation', name: f.name, qualifiedName: `${name}.${f.name}`, startLine: lineOf(m.index!), ...(f.types.length ? { references: f.types } : {}), metadata: { operationType: name!.toLowerCase(), returns: f.rawType } });
        }
      } else {
        b.add({ kind: 'schema', name: name!, startLine: lineOf(m.index!), ...(impl ? { implements: impl.split('&').map((s) => s.trim()).filter(Boolean) } : {}), ...(refs.length ? { references: refs } : {}), metadata: { graphqlKind: m[1]!, fields: fields.map((f) => f.name) } });
      }
    }
    for (const m of content.matchAll(/\benum\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
      b.add({ kind: 'enum', name: m[1]!, startLine: lineOf(m.index!), metadata: { values: m[2]!.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) } });
    }
    for (const m of content.matchAll(/\bscalar\s+(\w+)/g)) b.add({ kind: 'type', name: m[1]!, startLine: lineOf(m.index!), metadata: { graphqlKind: 'scalar' } });
    for (const m of content.matchAll(/\bunion\s+(\w+)\s*=\s*([\w\s|]+)/g)) {
      b.add({ kind: 'type', name: m[1]!, startLine: lineOf(m.index!), references: m[2]!.split('|').map((s) => s.trim()).filter(Boolean), metadata: { graphqlKind: 'union' } });
    }

    return { language: 'graphql', ok: true, ast: b.build(), errors: [] };
  },
};

function parseFields(body: string): Array<{ name: string; rawType: string; types: string[] }> {
  const out: Array<{ name: string; rawType: string; types: string[] }> = [];
  for (const line of body.split('\n')) {
    const m = /^\s*(\w+)\s*(?:\([^)]*\))?\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    const rawType = m[2]!.trim();
    const baseTypes = [...rawType.matchAll(/(\w+)/g)].map((x) => x[1]!).filter((t) => !SCALARS.has(t));
    out.push({ name: m[1]!, rawType, types: [...new Set(baseTypes)] });
  }
  return out;
}
