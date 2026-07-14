/**
 * Kubernetes manifest parser — multi-document YAML → normalized infra nodes.
 *
 * Maps each resource to a semantic node: Deployment/StatefulSet/DaemonSet →
 * `deployment` (with container images), Service → `service`, Ingress → `ingress`
 * (hosts/paths), Secret → `secret`, PersistentVolumeClaim → `volume`, etc. Cross-
 * references (a Service's selector, an Ingress' backend) are recorded for the
 * analyzer to resolve.
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename } from '../util';
import type { NodeKind } from '../ast/NormalizedAST';
import type { LanguageParser, ParseInput, ParseResult } from './types';
import { asArray, asObject, asString, getPath, parseYamlDocuments, type YamlValue } from './yaml';

const KIND_MAP: Readonly<Record<string, NodeKind>> = {
  Deployment: 'deployment',
  StatefulSet: 'deployment',
  DaemonSet: 'deployment',
  ReplicaSet: 'deployment',
  Pod: 'container',
  Job: 'deployment',
  CronJob: 'deployment',
  Service: 'service',
  Ingress: 'ingress',
  Secret: 'secret',
  ConfigMap: 'resource',
  PersistentVolumeClaim: 'volume',
  PersistentVolume: 'volume',
  Namespace: 'resource',
};

export const kubernetesParser: LanguageParser = {
  id: 'kubernetes',
  languages: ['kubernetes'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'kubernetes', basename(input.path));
    try {
      for (const doc of parseYamlDocuments(input.content)) {
        const obj = asObject(doc);
        if (!obj) continue;
        const kind = asString(obj.kind);
        const name = asString(getPath(obj, 'metadata', 'name')) ?? kind ?? 'resource';
        if (!kind) continue;
        const nodeKind = KIND_MAP[kind] ?? 'resource';
        const metadata: Record<string, string | number | boolean | string[]> = { k8sKind: kind, ...(asString(getPath(obj, 'metadata', 'namespace')) ? { namespace: asString(getPath(obj, 'metadata', 'namespace'))! } : {}) };
        const references: string[] = [];

        if (nodeKind === 'deployment' || nodeKind === 'container') {
          const containers = asArray(getPath(obj, 'spec', 'template', 'spec', 'containers')) ?? asArray(getPath(obj, 'spec', 'containers')) ?? [];
          metadata.images = containers.map((c) => asString(asObject(c)?.image) ?? '').filter(Boolean);
          metadata.replicas = Number(asString(getPath(obj, 'spec', 'replicas')) ?? 1);
        } else if (nodeKind === 'service') {
          const selector = asObject(getPath(obj, 'spec', 'selector'));
          if (selector) { metadata.selector = Object.entries(selector).map(([k, v]) => `${k}=${asString(v)}`); for (const v of Object.values(selector)) { const s = asString(v); if (s) references.push(s); } }
          metadata.serviceType = asString(getPath(obj, 'spec', 'type')) ?? 'ClusterIP';
        } else if (nodeKind === 'ingress') {
          const rules = asArray(getPath(obj, 'spec', 'rules')) ?? [];
          metadata.hosts = rules.map((r) => asString(asObject(r)?.host) ?? '').filter(Boolean);
          for (const r of rules) { const backends = collectIngressBackends(r); references.push(...backends); }
        }

        b.add({ kind: nodeKind, name, startLine: 1, ...(references.length ? { references: [...new Set(references)] } : {}), metadata });
      }
    } catch (e) {
      b.warn(`kubernetes parse recovered: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { language: 'kubernetes', ok: true, ast: b.build(), errors: [] };
  },
};

function collectIngressBackends(rule: YamlValue): string[] {
  const paths = asArray(getPath(rule, 'http', 'paths')) ?? [];
  const out: string[] = [];
  for (const p of paths) {
    const svc = asString(getPath(p, 'backend', 'service', 'name')) ?? asString(getPath(p, 'backend', 'serviceName'));
    if (svc) out.push(svc);
  }
  return out;
}
