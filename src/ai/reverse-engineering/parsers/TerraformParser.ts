/**
 * Terraform (HCL) parser — resource/module/provider/data blocks → normalized infra
 * resource nodes.
 *
 * Classifies cloud resources semantically from their type (`aws_db_instance` →
 * database, `aws_elasticache_*` → cache, `aws_sqs_*` → queue, `aws_s3_*` → volume,
 * …) and records interpolation references (`${aws_x.y.z}`) as dependencies.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { NodeKind } from '../ast/NormalizedAST';
import type { LanguageParser, ParseInput, ParseResult } from './types';

const RESOURCE_KIND: ReadonlyArray<{ re: RegExp; kind: NodeKind }> = [
  { re: /(_db_instance|_rds|_database|_sql|_documentdb|_dynamodb|_spanner|_cloud_sql)/i, kind: 'database' },
  { re: /(_elasticache|_memcached|_redis)/i, kind: 'cache' },
  { re: /(_sqs|_sns|_kinesis|_pubsub|_kafka|_mq|_queue)/i, kind: 'queue' },
  { re: /(_s3_bucket|_storage_bucket|_blob|_efs|_ebs_volume)/i, kind: 'volume' },
  { re: /(_ecs|_eks|_lambda|_function|_app_|_cloud_run|_instance|_container)/i, kind: 'service' },
  { re: /(_lb|_alb|_elb|_load_balancer|_api_gateway|_apigatewayv2)/i, kind: 'service' },
];

function classify(type: string): NodeKind {
  for (const { re, kind } of RESOURCE_KIND) if (re.test(type)) return kind;
  return 'resource';
}

export const terraformParser: LanguageParser = {
  id: 'terraform',
  languages: ['terraform'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'terraform', basename(input.path).replace(/\.tf$/, ''));
    const content = input.content.replace(/#.*$/gm, '').replace(/\/\/.*$/gm, '');
    const lineOf = (idx: number) => content.slice(0, idx).split('\n').length;

    // resource "type" "name" { ... }
    for (const m of content.matchAll(/\b(resource|data)\s+"([\w-]+)"\s+"([\w-]+)"\s*\{/g)) {
      const start = m.index!;
      const body = blockBody(content, start + m[0].length);
      const type = m[2]!;
      const name = m[3]!;
      const refs = interpolationRefs(body).filter((r) => r !== `${type}.${name}`);
      b.add({
        kind: m[1]! === 'data' ? 'resource' : classify(type),
        name: `${type}.${name}`,
        qualifiedName: `${type}.${name}`,
        startLine: lineOf(start),
        endLine: lineOf(start + m[0].length + body.length),
        ...(refs.length ? { references: refs } : {}),
        metadata: { resourceType: type, provider: type.split('_')[0]!, kind: m[1]! },
      });
    }
    // module "name" { source = ... }
    for (const m of content.matchAll(/\bmodule\s+"([\w-]+)"\s*\{/g)) {
      const body = blockBody(content, m.index! + m[0].length);
      const source = /source\s*=\s*"([^"]+)"/.exec(body)?.[1];
      b.add({ kind: 'module', name: m[1]!, startLine: lineOf(m.index!), metadata: { ...(source ? { source } : {}) }, references: interpolationRefs(body) });
    }
    // provider "name"
    for (const m of content.matchAll(/\bprovider\s+"([\w-]+)"\s*\{/g)) {
      b.add({ kind: 'resource', name: `provider.${m[1]!}`, startLine: lineOf(m.index!), metadata: { provider: m[1]!, kind: 'provider' } });
    }

    return { language: 'terraform', ok: true, ast: b.build(), errors: [] };
  },
};

/** Extract the balanced `{ … }` body starting just after an opening brace. */
function blockBody(content: string, openIndex: number): string {
  let depth = 1;
  let i = openIndex;
  for (; i < content.length && depth > 0; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
  }
  return content.slice(openIndex, i - 1);
}

/** Referenced resources from `${type.name.attr}` and bare `type.name.attr`. */
function interpolationRefs(body: string): string[] {
  const refs = new Set<string>();
  for (const m of body.matchAll(/\b([a-z][\w]*)\.([\w-]+)\.[\w-]+/g)) {
    if (m[1] !== 'var' && m[1] !== 'local' && m[1] !== 'each' && m[1] !== 'count') refs.add(`${m[1]}.${m[2]}`);
  }
  return [...refs];
}
