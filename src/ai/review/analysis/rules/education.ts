/**
 * Educational diagram / mind-map rules.
 *
 * Learning maps have pedagogical failure modes: a flat structure with no depth
 * (topics listed but not decomposed) and shallow hubs (a concept with almost no
 * elaboration). Circular prerequisites, broken flow, and orphaned concepts are
 * caught by the universal rules with education-specific wording.
 */

import type { ReviewRule, RuleContext, RuleFinding } from '../../model/Rule';
import { bfs } from '../../../understanding';

const EDU_DOMAINS = ['education', 'mind-map'] as const;

export const flatStructureRule: ReviewRule = {
  id: 'education/flat-structure',
  category: 'structure',
  severity: 'low',
  title: 'Shallow structure',
  description: 'A learning map that lists topics but never decomposes them (depth ≤ 1).',
  recommendation: 'Break top-level topics into sub-concepts so the material has learnable depth.',
  domains: EDU_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const entities = ctx.scopedEntities();
    if (entities.length < 5) return [];
    // Find roots (no incoming) and measure the deepest branch.
    const roots = entities.filter((e) => ctx.graph.index.incoming(e.id).length === 0 && ctx.graph.index.outgoing(e.id).length > 0);
    if (roots.length === 0) return [];
    let maxDepth = 0;
    for (const root of roots) {
      const result = bfs(ctx.graph, root.id, { direction: 'out' });
      for (const d of result.depth.values()) maxDepth = Math.max(maxDepth, d);
    }
    if (maxDepth > 1) return [];
    return [
      {
        key: 'flat',
        affectedEntities: roots.map((e) => e.id),
        message: 'The map is flat — top-level topics are not broken down into sub-concepts.',
        evidence: [`Maximum branch depth is ${maxDepth}; topics are listed but not decomposed.`],
        confidence: 0.7,
        metadata: { maxDepth },
      },
    ];
  },
};

export const shallowConceptRule: ReviewRule = {
  id: 'education/knowledge-gap',
  category: 'structure',
  severity: 'low',
  title: 'Potential knowledge gap',
  description: 'A central topic with far fewer sub-concepts than its siblings.',
  recommendation: 'Expand the thin topic so coverage is balanced across the map.',
  domains: EDU_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const entities = ctx.scopedEntities();
    if (entities.length < 6) return [];
    const roots = entities.filter((e) => ctx.graph.index.incoming(e.id).length === 0 && ctx.graph.index.outgoing(e.id).length > 0);
    if (roots.length !== 1) return [];
    const branches = ctx.graph.index.successors(roots[0]!.id).filter((id) => ctx.inScope(id));
    if (branches.length < 3) return [];
    const childCounts = branches.map((id) => ({ id, count: ctx.graph.index.successors(id).length }));
    const max = Math.max(...childCounts.map((c) => c.count));
    if (max < 2) return [];
    const thin = childCounts.filter((c) => c.count === 0);
    if (thin.length === 0) return [];
    return [
      {
        key: 'gap',
        affectedEntities: thin.map((c) => c.id),
        message: `${thin.length} topic(s) have no sub-concepts while others are elaborated — a possible coverage gap.`,
        evidence: thin.slice(0, 5).map((c) => `"${ctx.graph.entities.get(c.id)?.label}" has no sub-concepts (siblings have up to ${max}).`),
        confidence: 0.55,
      },
    ];
  },
};

export const EDUCATION_RULES: readonly ReviewRule[] = [flatStructureRule, shallowConceptRule];
