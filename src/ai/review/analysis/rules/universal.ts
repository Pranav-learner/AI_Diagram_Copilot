/**
 * Universal rules — structural checks that apply to every diagram domain.
 *
 * Cycles, disconnected clusters, and orphaned elements are problems whatever the
 * diagram means; only the *wording* changes by domain (a cycle is a "circular
 * dependency" in architecture, a "loop" in a workflow, a "circular prerequisite"
 * in a learning map). Each rule is a pure function of the Semantic Graph.
 */

import type { ExplanationDomain } from '../../../explain';
import { connectedComponents } from '../../../understanding';
import type { ReviewRule, RuleContext, RuleFinding } from '../../model/Rule';

function cycleWording(domain: ExplanationDomain): { title: string; noun: string; rec: string } {
  if (domain === 'business-workflow' || domain === 'flowchart')
    return { title: 'Loop in the flow', noun: 'loop', rec: 'Add an exit condition or a decision that breaks the loop so the process can terminate.' };
  if (domain === 'education' || domain === 'mind-map')
    return { title: 'Circular prerequisite', noun: 'circular prerequisite chain', rec: 'Break the cycle so concepts can be learned in a valid order.' };
  return { title: 'Circular dependency', noun: 'circular dependency', rec: 'Break the cycle by introducing an interface, an event/queue, or dependency inversion.' };
}

export const cycleRule: ReviewRule = {
  id: 'universal/cycle',
  category: 'reliability',
  severity: 'high',
  title: 'Circular dependency',
  description: 'Detects a directed cycle in the relationship graph.',
  recommendation: 'Break the cycle to remove the circular relationship.',
  evaluate(ctx: RuleContext): RuleFinding[] {
    const cycle = ctx.query.findCycle();
    if (!cycle) return [];
    const ids = cycle.map((e) => e.id).filter((id) => ctx.inScope(id));
    if (ids.length < 2) return [];
    const labels = cycle.map((e) => e.label);
    const w = cycleWording(ctx.domain);
    return [
      {
        key: 'cycle',
        title: w.title,
        affectedEntities: [...new Set(ids)],
        message: `A ${w.noun} exists: ${labels.join(' → ')}.`,
        evidence: [`Cycle of ${cycle.length} elements: ${labels.join(' → ')}.`],
        recommendation: w.rec,
        confidence: 1,
      },
    ];
  },
};

export const disconnectedRule: ReviewRule = {
  id: 'universal/disconnected-components',
  category: 'structure',
  severity: 'medium',
  title: 'Disconnected clusters',
  description: 'Detects when the diagram splits into unconnected groups.',
  recommendation: 'Connect the clusters, or confirm they are intentionally separate systems.',
  evaluate(ctx: RuleContext): RuleFinding[] {
    const components = connectedComponents(ctx.graph)
      .map((comp) => comp.filter((id) => ctx.inScope(id)))
      .filter((comp) => comp.length > 0);
    if (components.length < 2) return [];
    const smaller = components.slice(1); // the largest is the "main" cluster
    const affected = smaller.flat();
    const noun = ctx.domain === 'education' || ctx.domain === 'mind-map' ? 'broken learning flow' : 'disconnected clusters';
    return [
      {
        key: 'components',
        title: noun === 'broken learning flow' ? 'Broken learning flow' : 'Disconnected clusters',
        affectedEntities: affected,
        message: `The diagram is split into ${components.length} unconnected clusters.`,
        evidence: [`Largest cluster has ${components[0]!.length} elements; ${smaller.length} other cluster(s) are detached.`],
        confidence: 1,
        metadata: { clusters: components.length },
      },
    ];
  },
};

export const isolatedRule: ReviewRule = {
  id: 'universal/isolated-node',
  category: 'structure',
  severity: 'low',
  title: 'Isolated element',
  description: 'Detects elements with no relationships at all.',
  recommendation: 'Connect the element to the rest of the diagram, or remove it if unused.',
  evaluate(ctx: RuleContext): RuleFinding[] {
    const orphans = ctx.scopedEntities().filter((e) => ctx.graph.index.degree(e.id) === 0);
    if (orphans.length === 0) return [];
    const noun = ctx.domain === 'education' || ctx.domain === 'mind-map' ? 'orphaned concept' : ctx.domain === 'business-workflow' || ctx.domain === 'flowchart' ? 'disconnected activity' : 'isolated element';
    return [
      {
        key: 'isolated',
        title: `Isolated ${noun === 'isolated element' ? 'element' : noun.split(' ')[1]}`,
        affectedEntities: orphans.map((e) => e.id),
        message: `${orphans.length} ${noun}${orphans.length === 1 ? '' : 's'} with no connections: ${orphans.slice(0, 5).map((e) => e.label).join(', ')}${orphans.length > 5 ? ', …' : ''}.`,
        evidence: orphans.slice(0, 8).map((e) => `"${e.label}" has no relationships.`),
        confidence: 1,
      },
    ];
  },
};

export const UNIVERSAL_RULES: readonly ReviewRule[] = [cycleRule, disconnectedRule, isolatedRule];
