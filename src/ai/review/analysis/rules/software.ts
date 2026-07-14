/**
 * Software architecture rules — the professional static-analysis heart of the
 * review for system/architecture diagrams.
 *
 * Each rule is a deterministic detector over the Semantic Graph, mirroring the
 * checks a senior engineer runs during a design review: single points of failure,
 * missing security boundaries, un-cached hot datastores, tight coupling,
 * bottlenecks, dead services, missing observability, and weak separation of
 * concerns. No LLM is involved — findings are reproducible from the graph alone.
 */

import type { ReviewRule, RuleContext, RuleFinding } from '../../model/Rule';
import type { SemanticEntity } from '../../../understanding';
import {
  articulationPoints,
  scopedDegree,
  reachableFrom,
  CLIENT_KINDS,
  GATEWAY_KINDS,
  DATA_KINDS,
  SERVICE_KINDS,
} from '../graphUtils';

const SOFTWARE_DOMAINS = ['software-architecture', 'network-topology', 'system-design'] as const;

const INFRA_KINDS = ['database', 'gateway', 'loadBalancer', 'queue', 'cache', 'storage', 'server'];
const AUTH_RE = /\b(auth|authn|authz|authoriz|authentic|identity|iam|login|oauth|sso|keycloak|cognito)\b/i;
const OBSERVABILITY_RE = /\b(monitor|logging|log|metric|observ|tracing|trace|alert|prometheus|grafana|datadog|sentry|telemetry|apm)/i;
const CACHE_RE = /\b(cache|redis|memcached|varnish|cdn)\b/i;

function label(ctx: RuleContext, id: string): string {
  return ctx.graph.entities.get(id)?.label ?? id;
}

/** Infra kinds whose sole instance is a redundancy risk when depended upon. */
const REDUNDANCY_KINDS = ['database', 'gateway', 'loadBalancer', 'queue', 'cache', 'storage'];

export const singlePointOfFailureRule: ReviewRule = {
  id: 'software/single-point-of-failure',
  category: 'availability',
  severity: 'high',
  title: 'Single point of failure',
  description: 'A node with no redundancy that the system critically depends on — a structural chokepoint or a shared resource with only one instance.',
  recommendation: 'Add redundancy (a replica, a second instance, or a failover path) so the system survives losing this node.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const cutVertices = articulationPoints(ctx.graph);
    const findings: RuleFinding[] = [];
    for (const entity of ctx.scopedEntities()) {
      const deg = scopedDegree(ctx, entity.id);
      // Signal A: a structural chokepoint (removing it disconnects the graph).
      const isChokepoint = cutVertices.has(entity.id) && deg.in + deg.out >= 3 && (INFRA_KINDS.includes(entity.kind) || deg.in >= 3);
      // Signal B: a shared resource depended on by ≥2 components with no sibling of its kind.
      const isSharedResource = REDUNDANCY_KINDS.includes(entity.kind) && deg.in >= 2 && ctx.byKind(entity.kind).length === 1;
      if (!isChokepoint && !isSharedResource) continue;
      const why = isChokepoint
        ? `is a structural chokepoint (removing it disconnects the system)`
        : `is the only ${entity.kind} and ${deg.in} components depend on it`;
      findings.push({
        affectedEntities: [entity.id],
        title: `Single point of failure: ${entity.label}`,
        message: `"${entity.label}" is a single point of failure — it ${why}, with no redundancy.`,
        evidence: [`"${entity.label}" has in-degree ${deg.in} and out-degree ${deg.out}; no redundant instance exists.`],
        confidence: isChokepoint ? 0.85 : 0.8,
        metadata: { inDegree: deg.in, outDegree: deg.out },
      });
    }
    return findings;
  },
};

export const missingGatewayRule: ReviewRule = {
  id: 'software/missing-gateway',
  category: 'security',
  severity: 'high',
  title: 'No gateway between clients and services',
  description: 'External clients reach internal services directly, with no gateway/load balancer boundary.',
  recommendation: 'Route external traffic through an API gateway or load balancer to centralise auth, rate limiting, and routing.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const clients = ctx.scopedEntities().filter((e) => CLIENT_KINDS.includes(e.kind as (typeof CLIENT_KINDS)[number]));
    const hasGateway = ctx.scopedEntities().some((e) => GATEWAY_KINDS.includes(e.kind as (typeof GATEWAY_KINDS)[number]));
    if (clients.length === 0 || hasGateway) return [];

    const directEdges: string[] = [];
    const affected = new Set<string>();
    const internalKinds: readonly string[] = [...SERVICE_KINDS, ...DATA_KINDS];
    for (const client of clients) {
      for (const relId of ctx.graph.index.outgoing(client.id)) {
        const rel = ctx.graph.relationships.get(relId);
        if (!rel || !ctx.inScope(rel.target)) continue;
        const target = ctx.graph.entities.get(rel.target);
        if (target && internalKinds.includes(target.kind)) {
          directEdges.push(`${client.label} → ${target.label}`);
          affected.add(client.id);
          affected.add(target.id);
        }
      }
    }
    if (directEdges.length === 0) return [];
    return [
      {
        key: 'no-gateway',
        affectedEntities: [...affected],
        message: `External clients reach internal components directly with no gateway or load balancer in front.`,
        evidence: [`Direct client→service connections: ${directEdges.slice(0, 5).join(', ')}${directEdges.length > 5 ? ', …' : ''}.`],
        confidence: 0.8,
      },
    ];
  },
};

export const missingAuthRule: ReviewRule = {
  id: 'software/missing-authentication',
  category: 'security',
  severity: 'high',
  title: 'No authentication / authorization boundary',
  description: 'User-facing systems with data stores but no identifiable auth component.',
  recommendation: 'Add an authentication/authorization component (auth service, identity provider, or gateway auth) in front of protected resources.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const hasClient = ctx.scopedEntities().some((e) => CLIENT_KINDS.includes(e.kind as (typeof CLIENT_KINDS)[number]));
    const hasData = ctx.scopedEntities().some((e) => DATA_KINDS.includes(e.kind as (typeof DATA_KINDS)[number]) || e.kind === 'service');
    if (!hasClient || !hasData) return [];
    const hasAuth = ctx.scopedEntities().some((e) => AUTH_RE.test(e.label) || AUTH_RE.test(e.kind) || (e.tags ?? []).some((t) => AUTH_RE.test(t)));
    if (hasAuth) return [];
    return [
      {
        key: 'no-auth',
        affectedEntities: ctx.scopedEntities().filter((e) => CLIENT_KINDS.includes(e.kind as (typeof CLIENT_KINDS)[number])).map((e) => e.id),
        message: 'There is no authentication or authorization component protecting user-facing resources.',
        evidence: ['Clients and data stores are present but no auth/identity component was found.'],
        confidence: 0.7,
      },
    ];
  },
};

export const missingCacheRule: ReviewRule = {
  id: 'software/missing-cache',
  category: 'performance',
  severity: 'medium',
  title: 'Hot datastore without a cache',
  description: 'A datastore read by several services with no caching layer.',
  recommendation: 'Introduce a cache (e.g. Redis) in front of frequently-read data to cut latency and database load.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const hasCache = ctx.scopedEntities().some((e) => e.kind === 'cache' || CACHE_RE.test(e.label));
    if (hasCache) return [];
    const findings: RuleFinding[] = [];
    for (const db of ctx.scopedEntities()) {
      if (!DATA_KINDS.includes(db.kind as (typeof DATA_KINDS)[number])) continue;
      const deg = scopedDegree(ctx, db.id);
      if (deg.in < 2) continue;
      findings.push({
        affectedEntities: [db.id],
        title: `No cache in front of ${db.label}`,
        message: `"${db.label}" is read by ${deg.in} components but has no caching layer.`,
        evidence: [`${deg.in} components depend directly on "${db.label}"; no cache entity exists in the diagram.`],
        confidence: 0.7,
        metadata: { readers: deg.in },
      });
    }
    return findings;
  },
};

export const tightCouplingRule: ReviewRule = {
  id: 'software/tight-coupling',
  category: 'coupling',
  severity: 'medium',
  title: 'Tight coupling',
  description: 'Bidirectional dependencies or excessive fan-out between components.',
  recommendation: 'Decouple via an event/message queue, an interface, or by inverting the dependency direction.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    const seenPairs = new Set<string>();

    // Bidirectional dependencies (A↔B).
    for (const rel of ctx.graph.relationships.values()) {
      if (!ctx.inScope(rel.source) || !ctx.inScope(rel.target)) continue;
      const back = ctx.graph.index.successors(rel.target);
      if (back.includes(rel.source)) {
        const pair = [rel.source, rel.target].sort().join('|');
        if (seenPairs.has(pair)) continue;
        seenPairs.add(pair);
        findings.push({
          key: pair,
          affectedEntities: [rel.source, rel.target],
          title: 'Bidirectional coupling',
          message: `"${label(ctx, rel.source)}" and "${label(ctx, rel.target)}" depend on each other.`,
          evidence: [`A mutual dependency exists between "${label(ctx, rel.source)}" and "${label(ctx, rel.target)}".`],
          confidence: 0.9,
        });
      }
    }

    // Excessive fan-out.
    for (const e of ctx.scopedEntities()) {
      const deg = scopedDegree(ctx, e.id);
      if (deg.out >= 5) {
        findings.push({
          key: `fanout:${e.id}`,
          affectedEntities: [e.id],
          title: `High fan-out from ${e.label}`,
          message: `"${e.label}" depends on ${deg.out} other components, creating tight coupling.`,
          evidence: [`"${e.label}" has out-degree ${deg.out}.`],
          confidence: 0.75,
          severity: 'low',
          metadata: { fanOut: deg.out },
        });
      }
    }
    return findings;
  },
};

export const bottleneckRule: ReviewRule = {
  id: 'software/scalability-bottleneck',
  category: 'scalability',
  severity: 'medium',
  title: 'Scalability bottleneck',
  description: 'A single node that many components depend on, with no load balancing.',
  recommendation: 'Scale the node horizontally behind a load balancer, or shard/partition the load.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const hasLB = ctx.scopedEntities().some((e) => e.kind === 'loadBalancer');
    const findings: RuleFinding[] = [];
    for (const e of ctx.scopedEntities()) {
      const deg = scopedDegree(ctx, e.id);
      if (deg.in >= 5 && !hasLB && e.kind !== 'loadBalancer' && e.kind !== 'gateway') {
        findings.push({
          affectedEntities: [e.id],
          title: `Potential bottleneck: ${e.label}`,
          message: `"${e.label}" is depended on by ${deg.in} components with no load balancing.`,
          evidence: [`"${e.label}" has in-degree ${deg.in}; no load balancer is present.`],
          confidence: 0.7,
          metadata: { dependents: deg.in },
        });
      }
    }
    return findings;
  },
};

export const deadServiceRule: ReviewRule = {
  id: 'software/dead-service',
  category: 'maintainability',
  severity: 'medium',
  title: 'Unreachable / dead service',
  description: 'A service that cannot be reached from any entry point (client or gateway).',
  recommendation: 'Wire the service into a request path, or remove it if it is no longer used.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const entryKinds = [...CLIENT_KINDS, ...GATEWAY_KINDS];
    const entries = ctx.scopedEntities().filter((e) => entryKinds.includes(e.kind as never)).map((e) => e.id);
    if (entries.length === 0) return []; // no notion of "entry" → skip
    const reachable = reachableFrom(ctx, entries);
    const dead = ctx.scopedEntities().filter(
      (e) => SERVICE_KINDS.includes(e.kind as (typeof SERVICE_KINDS)[number]) && !reachable.has(e.id) && ctx.graph.index.degree(e.id) > 0,
    );
    if (dead.length === 0) return [];
    return dead.map((e) => ({
      affectedEntities: [e.id],
      title: `Unreachable service: ${e.label}`,
      message: `"${e.label}" is not reachable from any client or gateway.`,
      evidence: [`No path connects "${e.label}" to an entry point.`],
      confidence: 0.75,
    }));
  },
};

export const missingObservabilityRule: ReviewRule = {
  id: 'software/missing-observability',
  category: 'observability',
  severity: 'low',
  title: 'No observability',
  description: 'A non-trivial system with no monitoring, logging, or tracing component.',
  recommendation: 'Add observability (metrics, centralised logging, tracing) so the system can be operated and debugged.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const entities = ctx.scopedEntities();
    if (entities.length < 5) return [];
    const hasObs = entities.some((e) => OBSERVABILITY_RE.test(e.label) || OBSERVABILITY_RE.test(e.kind) || (e.tags ?? []).some((t) => OBSERVABILITY_RE.test(t)));
    if (hasObs) return [];
    return [
      {
        key: 'no-observability',
        affectedEntities: [],
        message: 'The system has no monitoring, logging, or tracing component.',
        evidence: [`${entities.length} components and no observability tooling found.`],
        confidence: 0.65,
      },
    ];
  },
};

export const poorSeparationRule: ReviewRule = {
  id: 'software/poor-separation',
  category: 'maintainability',
  severity: 'low',
  title: 'Weak separation of concerns',
  description: 'A large diagram with no grouping into subsystems / layers.',
  recommendation: 'Group related components into subsystems, layers, or bounded contexts to clarify responsibilities.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    if (!ctx.whole) return [];
    const entities = ctx.scopedEntities();
    if (entities.length < 8 || ctx.graph.groups.size > 0) return [];
    return [
      {
        key: 'no-grouping',
        affectedEntities: [],
        message: `${entities.length} components are not organised into any groups or layers.`,
        evidence: [`${entities.length} components, 0 groups.`],
        confidence: 0.7,
      },
    ];
  },
};

export const duplicateResponsibilityRule: ReviewRule = {
  id: 'software/duplicate-responsibility',
  category: 'maintainability',
  severity: 'low',
  title: 'Possible duplicate responsibility',
  description: 'Multiple components of the same kind whose labels overlap.',
  recommendation: 'Confirm the components have distinct responsibilities, or consolidate them.',
  domains: SOFTWARE_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const byToken = new Map<string, SemanticEntity[]>();
    for (const e of ctx.scopedEntities()) {
      if (!SERVICE_KINDS.includes(e.kind as (typeof SERVICE_KINDS)[number])) continue;
      for (const token of significantTokens(e.label)) {
        const bucket = byToken.get(`${e.kind}:${token}`) ?? [];
        bucket.push(e);
        byToken.set(`${e.kind}:${token}`, bucket);
      }
    }
    const findings: RuleFinding[] = [];
    const emitted = new Set<string>();
    for (const [token, group] of byToken) {
      if (group.length < 2) continue;
      const ids = group.map((e) => e.id).sort();
      const sig = ids.join('|');
      if (emitted.has(sig)) continue;
      emitted.add(sig);
      findings.push({
        key: token,
        affectedEntities: ids,
        message: `${group.length} components share the theme "${token.split(':')[1]}": ${group.map((e) => e.label).join(', ')}.`,
        evidence: [`Same kind (${group[0]!.kind}) with overlapping labels.`],
        confidence: 0.55,
      });
    }
    return findings;
  },
};

function significantTokens(labelText: string): string[] {
  return labelText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !['service', 'server', 'component'].includes(t));
}

export const SOFTWARE_RULES: readonly ReviewRule[] = [
  singlePointOfFailureRule,
  missingGatewayRule,
  missingAuthRule,
  missingCacheRule,
  tightCouplingRule,
  bottleneckRule,
  deadServiceRule,
  missingObservabilityRule,
  poorSeparationRule,
  duplicateResponsibilityRule,
];
