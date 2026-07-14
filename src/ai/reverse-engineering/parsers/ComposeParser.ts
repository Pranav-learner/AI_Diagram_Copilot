/**
 * Docker Compose parser — services → normalized service/database/cache/queue nodes.
 *
 * Classifies each service semantically from its image (postgres → database, redis →
 * cache, rabbitmq/kafka → queue, …), and records ports, environment, volumes, and
 * `depends_on` (→ dependency relations, via `references`).
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { NodeKind } from '../ast/NormalizedAST';
import type { LanguageParser, ParseInput, ParseResult } from './types';
import { asArray, asObject, asString, parseYaml, type YamlValue } from './yaml';

const IMAGE_KIND: ReadonlyArray<{ re: RegExp; kind: NodeKind }> = [
  { re: /postgres|mysql|mariadb|mongo|cockroach|cassandra|clickhouse/i, kind: 'database' },
  { re: /redis|memcached/i, kind: 'cache' },
  { re: /rabbitmq|kafka|nats|activemq|pulsar/i, kind: 'queue' },
  { re: /nginx|traefik|haproxy|envoy/i, kind: 'service' },
];

function classify(image: string): NodeKind {
  for (const { re, kind } of IMAGE_KIND) if (re.test(image)) return kind;
  return 'service';
}

export const composeParser: LanguageParser = {
  id: 'docker-compose',
  languages: ['docker-compose'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'docker-compose', basename(input.path));
    try {
      const root = asObject(parseYaml(input.content));
      const services = root ? asObject(root.services) : undefined;
      if (services) {
        for (const [name, def] of Object.entries(services)) {
          const svc = asObject(def) ?? {};
          const image = asString(svc.image) ?? '';
          const dependsOn = normalizeList(svc.depends_on);
          b.add({
            kind: classify(image),
            name,
            startLine: 1,
            ...(dependsOn.length ? { references: dependsOn } : {}),
            metadata: {
              ...(image ? { image } : { build: asString(asObject(svc.build)?.context ?? svc.build) ?? '.' }),
              ports: normalizeList(svc.ports),
              environment: envKeys(svc.environment),
              volumes: normalizeList(svc.volumes),
              networks: normalizeList(svc.networks),
              dependsOn,
            },
          });
        }
      } else b.warn('no services block found');
    } catch (e) {
      b.warn(`compose parse recovered: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { language: 'docker-compose', ok: true, ast: b.build(), errors: [] };
  },
};

function normalizeList(value: YamlValue | undefined): string[] {
  const arr = asArray(value);
  if (arr) return arr.map((v) => (typeof v === 'object' && v && !Array.isArray(v) ? Object.keys(v)[0] ?? '' : asString(v) ?? '')).filter(Boolean);
  const obj = asObject(value);
  if (obj) return Object.keys(obj);
  const s = asString(value);
  return s ? [s] : [];
}

function envKeys(value: YamlValue | undefined): string[] {
  const obj = asObject(value);
  if (obj) return Object.keys(obj);
  const arr = asArray(value);
  if (arr) return arr.map((v) => asString(v)?.split('=')[0] ?? '').filter(Boolean);
  return [];
}
