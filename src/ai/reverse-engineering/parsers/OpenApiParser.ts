/**
 * OpenAPI / Swagger parser (JSON or YAML) — paths → operations/endpoints, and
 * components/definitions → schema nodes.
 *
 * Captures method, path, operationId, tags, and security per operation, plus the
 * declared request/response schema references.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';
import { asArray, asObject, asString, parseYaml, type YamlValue } from './yaml';

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

export const openApiParser: LanguageParser = {
  id: 'openapi',
  languages: ['openapi'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'openapi', basename(input.path));
    let root: Record<string, YamlValue> | undefined;
    try {
      root = asObject(input.content.trim().startsWith('{') ? (JSON.parse(input.content) as YamlValue) : parseYaml(input.content));
    } catch (e) {
      return { language: 'openapi', ok: false, errors: [`openapi parse failed: ${e instanceof Error ? e.message : String(e)}`] };
    }
    if (!root) return { language: 'openapi', ok: false, errors: ['openapi root is not an object'] };

    b.setMeta('title', asString(asObject(root.info)?.title) ?? '');
    b.setMeta('apiVersion', asString(asObject(root.info)?.version) ?? '');
    b.setMeta('spec', asString(root.openapi) ?? asString(root.swagger) ?? 'openapi');

    const paths = asObject(root.paths) ?? {};
    for (const [path, ops] of Object.entries(paths)) {
      const opsObj = asObject(ops) ?? {};
      for (const method of METHODS) {
        const op = asObject(opsObj[method]);
        if (!op) continue;
        const refs = collectRefs(op);
        b.add({
          kind: 'endpoint',
          name: `${method.toUpperCase()} ${path}`,
          startLine: 1,
          ...(refs.length ? { references: refs } : {}),
          metadata: {
            method: method.toUpperCase(),
            path,
            ...(asString(op.operationId) ? { operationId: asString(op.operationId)! } : {}),
            tags: (asArray(op.tags) ?? []).map((t) => asString(t) ?? '').filter(Boolean),
            secured: op.security !== undefined,
          },
        });
      }
    }

    const schemas = asObject(asObject(root.components)?.schemas) ?? asObject(root.definitions) ?? {};
    for (const [name, def] of Object.entries(schemas)) {
      const props = asObject(asObject(def)?.properties);
      b.add({ kind: 'schema', name, startLine: 1, metadata: { fields: props ? Object.keys(props) : [], type: asString(asObject(def)?.type) ?? 'object' } });
    }

    return { language: 'openapi', ok: true, ast: b.build(), errors: [] };
  },
};

/** Collect `$ref` schema names anywhere in an operation object. */
function collectRefs(value: YamlValue, acc = new Set<string>()): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectRefs(v, acc));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') acc.add(v.split('/').pop()!);
      else collectRefs(v, acc);
    }
  }
  return [...acc];
}
