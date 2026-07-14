/**
 * Classification — the "front-end semantic analysis" pass.
 *
 * Turns raw DSL nodes/edges into canonical {@link EntityKind}/{@link RelationshipKind}.
 * This is where the engine adds value the DSL lacks: it *infers* meaning from the
 * available signals (explicit semantic role → shape → structural type) rather than
 * merely passing `node.semantic` through. Classification is deterministic and
 * side-effect free so it can run inside incremental updates cheaply.
 */

import type { DiagramEdge, DiagramNode } from '@/dsl';
import type { EntityKind } from '../model/entity';
import type { RelationshipKind } from '../model/relationship';

/** Normalise a free-form role/shape token for table lookup. */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Raw DSL semantic roles (from the generation vocabulary + DSL defaults) mapped
 * onto canonical kinds. Keys are {@link norm}-alised. Unrecognised roles are
 * preserved verbatim by {@link inferEntityKind} rather than forced through here.
 */
const ROLE_TO_KIND: Readonly<Record<string, EntityKind>> = {
  // architecture
  service: 'service',
  api: 'api',
  gateway: 'gateway',
  apigateway: 'gateway',
  client: 'user',
  database: 'database',
  db: 'database',
  datastore: 'database',
  cache: 'cache',
  queue: 'queue',
  messagequeue: 'queue',
  broker: 'queue',
  topic: 'queue',
  server: 'server',
  host: 'server',
  cloud: 'cloud',
  external: 'externalSystem',
  externalsystem: 'externalSystem',
  storage: 'storage',
  bucket: 'storage',
  loadbalancer: 'loadBalancer',
  lb: 'loadBalancer',
  router: 'network' as EntityKind,
  switch: 'network' as EntityKind,
  firewall: 'network' as EntityKind,
  function: 'function',
  lambda: 'function',
  component: 'component',
  // actors
  user: 'user',
  actor: 'actor',
  person: 'actor',
  participant: 'actor',
  role: 'actor',
  // flow / process
  start: 'start',
  initial: 'start',
  begin: 'start',
  end: 'end',
  final: 'end',
  terminator: 'end',
  stop: 'end',
  process: 'process',
  task: 'task',
  step: 'process',
  action: 'process',
  decision: 'decision',
  condition: 'decision',
  branch: 'decision',
  gatewaydecision: 'decision',
  event: 'event',
  milestone: 'event',
  state: 'state',
  outcome: 'end',
  input: 'process',
  output: 'process',
  // data / modelling
  entity: 'entity',
  class: 'class',
  interface: 'interface',
  abstract: 'class',
  document: 'document',
  doc: 'document',
  // mindmap
  topicnode: 'component',
  subtopic: 'component',
};

/** Fallback: infer kind from the DSL shape primitive when no role is present. */
const SHAPE_TO_KIND: Readonly<Record<string, EntityKind>> = {
  cylinder: 'database',
  diamond: 'decision',
  cloud: 'cloud',
  hexagon: 'api',
  parallelogram: 'process',
  triangle: 'decision',
  // rectangle/roundedRectangle/ellipse/circle are too generic to imply meaning.
};

/**
 * Classify a DSL node into a canonical {@link EntityKind}.
 *
 * Precedence: explicit `semantic` role (canonicalised, or preserved verbatim if
 * unknown-but-meaningful) → shape-based inference → structural node type →
 * `unknown`. Returns whether the result was *inferred* (no explicit role) so the
 * IR can mark provenance.
 */
export function inferEntityKind(node: DiagramNode): { kind: EntityKind; inferred: boolean } {
  // Non-shape structural nodes have a direct semantic reading.
  switch (node.type) {
    case 'text':
      return { kind: 'text', inferred: false };
    case 'image':
      return { kind: 'image', inferred: false };
    case 'icon':
      return { kind: 'icon', inferred: false };
    case 'container':
      return { kind: 'container', inferred: false };
    case 'shape':
      break;
    default:
      return { kind: 'unknown', inferred: true };
  }

  const role = node.semantic;
  if (role && role.trim().length > 0) {
    const mapped = ROLE_TO_KIND[norm(role)];
    if (mapped) return { kind: mapped, inferred: false };
    // Unknown but explicit role: honour the author's intent, keep it verbatim.
    return { kind: role as EntityKind, inferred: false };
  }

  const byShape = SHAPE_TO_KIND[norm(node.shape)];
  if (byShape) return { kind: byShape, inferred: true };

  return { kind: 'unknown', inferred: true };
}

/**
 * DSL `relType` hints (generation vocabulary) mapped onto canonical relationship
 * kinds. Canonical names also pass straight through.
 */
const RELTYPE_TO_KIND: Readonly<Record<string, RelationshipKind>> = {
  association: 'associatedWith',
  associatedwith: 'associatedWith',
  dependency: 'dependsOn',
  dependson: 'dependsOn',
  depends: 'dependsOn',
  flow: 'flowsTo',
  flowsto: 'flowsTo',
  message: 'sends',
  sends: 'sends',
  inheritance: 'inherits',
  inherits: 'inherits',
  extends: 'inherits',
  composition: 'composedOf',
  composedof: 'composedOf',
  aggregation: 'aggregates',
  aggregates: 'aggregates',
  transition: 'transitionsTo',
  transitionsto: 'transitionsTo',
  contains: 'contains',
  link: 'connectsTo',
  connectsto: 'connectsTo',
  connect: 'connectsTo',
  calls: 'calls',
  call: 'calls',
  invokes: 'calls',
  owns: 'owns',
  produces: 'produces',
  consumes: 'consumes',
  references: 'references',
  triggers: 'triggers',
  trigger: 'triggers',
  uses: 'uses',
  use: 'uses',
  custom: 'connectsTo',
};

/**
 * Classify a DSL edge into a canonical {@link RelationshipKind}.
 *
 * Reads the semantic hint from `metadata.semanticRelation` (explicit override) or
 * `metadata.relType` (written by generation). With no hint, a labelled edge is
 * `connectsTo` and an unlabelled directed edge is `flowsTo`.
 */
export function inferRelationshipKind(edge: DiagramEdge): { kind: RelationshipKind; inferred: boolean } {
  const meta = edge.metadata as Record<string, unknown>;
  const hint = meta['semanticRelation'] ?? meta['relType'];
  if (typeof hint === 'string' && hint.trim().length > 0) {
    const mapped = RELTYPE_TO_KIND[norm(hint)];
    if (mapped) return { kind: mapped, inferred: false };
    return { kind: hint as RelationshipKind, inferred: false };
  }

  const directed = edge.arrowheads.end !== 'none' || edge.arrowheads.start !== 'none';
  return { kind: directed ? 'flowsTo' : 'connectsTo', inferred: true };
}
