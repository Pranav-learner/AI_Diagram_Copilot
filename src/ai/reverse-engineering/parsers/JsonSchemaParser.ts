/**
 * JSON Schema parser — top-level + `definitions`/`$defs` schemas → `schema` nodes.
 *
 * Records each schema's declared type, property names, required fields, and `$ref`
 * dependencies. Recovers gracefully on invalid JSON.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

interface JsonObj {
  [key: string]: unknown;
}

export const jsonSchemaParser: LanguageParser = {
  id: 'json-schema',
  languages: ['json-schema'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'json-schema', basename(input.path).replace(/\.(json|schema\.json)$/, ''));
    let root: JsonObj;
    try {
      root = JSON.parse(input.content) as JsonObj;
    } catch (e) {
      return { language: 'json-schema', ok: false, errors: [`json parse failed: ${e instanceof Error ? e.message : String(e)}`] };
    }

    const title = typeof root.title === 'string' ? root.title : basename(input.path);
    addSchema(b, title, root);
    for (const key of ['definitions', '$defs'] as const) {
      const defs = root[key];
      if (defs && typeof defs === 'object') for (const [name, def] of Object.entries(defs)) if (def && typeof def === 'object') addSchema(b, name, def as JsonObj);
    }

    return { language: 'json-schema', ok: true, ast: b.build(), errors: [] };
  },
};

function addSchema(b: ASTBuilder, name: string, schema: JsonObj): void {
  const props = schema.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties as JsonObj) : [];
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const refs = collectRefs(schema);
  b.add({
    kind: 'schema',
    name,
    startLine: 1,
    ...(refs.length ? { references: refs } : {}),
    metadata: { type: typeof schema.type === 'string' ? schema.type : 'object', fields: props, required },
  });
}

function collectRefs(value: unknown, acc = new Set<string>()): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectRefs(v, acc));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') acc.add(v.split('/').pop()!);
      else collectRefs(v, acc);
    }
  }
  return [...acc];
}
