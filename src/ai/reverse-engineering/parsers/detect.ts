/**
 * Language detection — deterministic, from filename, extension, then content.
 *
 * YAML/JSON are ambiguous (Kubernetes, Compose, OpenAPI, and JSON Schema all use
 * them), so detection sniffs their content for discriminating keys. Pure and
 * side-effect free.
 */

import type { Language } from '../ast/NormalizedAST';
import { basename, extname } from '../util';

const EXT_LANGUAGE: Readonly<Record<string, Language>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  java: 'java',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'terraform',
  tfvars: 'terraform',
};

/** Detect the language/format of a file from its path and content. */
export function detectLanguage(path: string, content: string): Language {
  const name = basename(path).toLowerCase();
  const ext = extname(path);

  if (/^dockerfile(\.|$)/.test(name) || name === 'containerfile') return 'dockerfile';
  if (/^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(name)) return 'docker-compose';
  if (EXT_LANGUAGE[ext]) return EXT_LANGUAGE[ext]!;

  // JSON/YAML (or extensionless): sniff the content for discriminating keys.
  return sniffStructured(content, ext);
}

function sniffStructured(content: string, ext: string): Language {
  const head = content.slice(0, 4000);
  if (/^\s*(openapi|swagger)\s*:/m.test(head) || /"(openapi|swagger)"\s*:/.test(head)) return 'openapi';
  if (/^\s*apiVersion\s*:/m.test(head) && /^\s*kind\s*:/m.test(head)) return 'kubernetes';
  if (/^\s*services\s*:/m.test(head) && (/^\s*version\s*:/m.test(head) || /^\s*image\s*:/m.test(head))) return 'docker-compose';
  if (/"\$schema"\s*:/.test(head) || (/"(properties|definitions)"\s*:/.test(head) && /"type"\s*:/.test(head))) return 'json-schema';
  return ext === 'json' ? 'json-schema' : 'unknown';
}
