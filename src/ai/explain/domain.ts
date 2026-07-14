/**
 * Domain detection — infer the *kind* of diagram from the Semantic Graph so the
 * model explains as the right expert (a state machine ≠ an ER diagram ≠ a
 * microservice architecture).
 *
 * This is pure structural inference over entity kinds, relationship kinds, and
 * topology — never the DSL or a stored "diagram type" (there isn't a reliable
 * one). It scores each candidate domain from the signals present and picks the
 * strongest, defaulting to `generic` when nothing dominates.
 */

import type { SemanticGraph } from '../understanding';
import type { ExplanationDomain, ExplanationStyle } from './model/ExplainTypes';

/** Count entities whose kind is in `kinds`. */
function countKinds(graph: SemanticGraph, kinds: readonly string[]): number {
  let n = 0;
  for (const k of kinds) n += graph.index.byKind(k).length;
  return n;
}

/** Count relationships whose kind is in `kinds`. */
function countRelKinds(graph: SemanticGraph, kinds: readonly string[]): number {
  let n = 0;
  for (const k of kinds) n += graph.index.relationshipsByKind(k).length;
  return n;
}

/**
 * Detect the most likely {@link ExplanationDomain}. Deterministic; scores each
 * domain from kind/relationship/topology signals and returns the best (ties break
 * toward the more specific domain via declaration order).
 */
export function detectDomain(graph: SemanticGraph): ExplanationDomain {
  const n = graph.entities.size;
  if (n === 0) return 'generic';

  const scores: Array<{ domain: ExplanationDomain; score: number }> = [
    { domain: 'er-diagram', score: countKinds(graph, ['entity', 'class', 'interface']) * 2 },
    {
      domain: 'state-machine',
      score: countKinds(graph, ['state']) * 2 + countRelKinds(graph, ['transitionsTo']) * 2,
    },
    {
      domain: 'flowchart',
      score: countKinds(graph, ['decision', 'process', 'start', 'end', 'task']) + countRelKinds(graph, ['flowsTo']),
    },
    {
      domain: 'network-topology',
      score: countKinds(graph, ['gateway', 'loadBalancer', 'server', 'cloud', 'externalSystem']) * 1.5,
    },
    {
      domain: 'software-architecture',
      score: countKinds(graph, ['service', 'api', 'database', 'cache', 'queue', 'function']) * 1.5,
    },
    {
      domain: 'business-workflow',
      score: countKinds(graph, ['actor', 'user', 'document', 'process', 'task']),
    },
    { domain: 'sequence', score: countKinds(graph, ['actor']) >= 2 ? countRelKinds(graph, ['sends', 'calls']) : 0 },
  ];

  // Mind maps read as a single-rooted tree/hierarchy of generic/component nodes.
  if (isTreeLike(graph)) {
    const generic = countKinds(graph, ['component', 'text', 'unknown']);
    scores.push({ domain: 'mind-map', score: generic + n * 0.5 });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]!;
  if (best.score <= 0) return 'generic';
  return best.domain;
}

/** A weakly-connected, acyclic graph with a single source reads as a hierarchy. */
function isTreeLike(graph: SemanticGraph): boolean {
  if (graph.stats.hasCycles || graph.stats.componentCount > 1) return false;
  let sourceCount = 0;
  for (const id of graph.entities.keys()) {
    if (graph.index.incoming(id).length === 0 && graph.index.outgoing(id).length > 0) sourceCount++;
    if (sourceCount > 1) return false;
  }
  return sourceCount === 1 && graph.relationships.size === graph.entities.size - 1;
}

/** The default explanation register for a domain (overridable by the caller). */
export function defaultStyleForDomain(domain: ExplanationDomain): ExplanationStyle {
  switch (domain) {
    case 'business-workflow':
      return 'business';
    case 'education':
    case 'mind-map':
      return 'educational';
    default:
      return 'technical';
  }
}

/** A human phrase for a domain, used in prompts. */
export function domainLabel(domain: ExplanationDomain): string {
  const labels: Record<string, string> = {
    'software-architecture': 'software architecture',
    'business-workflow': 'business workflow',
    education: 'educational',
    'network-topology': 'network topology',
    'system-design': 'system design',
    'mind-map': 'mind map',
    'er-diagram': 'entity-relationship (data model)',
    sequence: 'sequence',
    flowchart: 'flowchart / process flow',
    'state-machine': 'state machine',
    generic: 'diagram',
  };
  return labels[domain] ?? String(domain);
}
