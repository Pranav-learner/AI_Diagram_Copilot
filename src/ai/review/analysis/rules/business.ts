/**
 * Business workflow / flowchart rules.
 *
 * Process diagrams have their own failure modes: activities that dead-end before
 * reaching an outcome, flows with no start or end, unreachable steps, and flows
 * that make decisions without any approval/validation gate. All are detected
 * deterministically from the flow graph.
 */

import type { ReviewRule, RuleContext, RuleFinding } from '../../model/Rule';
import { scopedDegree, reachableFrom } from '../graphUtils';

const FLOW_DOMAINS = ['business-workflow', 'flowchart'] as const;
const FLOW_AND_STATE = ['business-workflow', 'flowchart', 'state-machine'] as const;

const START_KINDS = ['start'];
const END_KINDS = ['end'];
const DECISION_KINDS = ['decision'];
const APPROVAL_RE = /\b(approv|review|validate|verify|check|authoriz|sign-?off|confirm)\b/i;

export const deadEndRule: ReviewRule = {
  id: 'business/dead-end',
  category: 'process',
  severity: 'high',
  title: 'Dead-end activity',
  description: 'An activity with no outgoing flow that is not a terminal (end) node.',
  recommendation: 'Connect the activity to the next step, or mark it as an explicit end state.',
  domains: FLOW_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    for (const e of ctx.scopedEntities()) {
      if (END_KINDS.includes(e.kind)) continue;
      const deg = scopedDegree(ctx, e.id);
      if (deg.out === 0 && deg.in > 0) {
        findings.push({
          affectedEntities: [e.id],
          title: `Dead end: ${e.label}`,
          message: `"${e.label}" has no outgoing step and is not an end state — the flow stops here unexpectedly.`,
          evidence: [`"${e.label}" (kind ${e.kind}) has no outgoing transitions.`],
          confidence: 0.85,
        });
      }
    }
    return findings;
  },
};

export const missingStartRule: ReviewRule = {
  id: 'business/missing-start',
  category: 'process',
  severity: 'medium',
  title: 'No start node',
  description: 'The flow has no explicit start.',
  recommendation: 'Add an explicit start node so the entry point of the process is unambiguous.',
  domains: FLOW_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    if (ctx.scopedEntities().length < 3) return [];
    if (ctx.scopedEntities().some((e) => START_KINDS.includes(e.kind))) return [];
    return [{ key: 'no-start', affectedEntities: [], message: 'The process has no explicit start node.', evidence: ['No node of kind "start" found.'], confidence: 0.8 }];
  },
};

export const missingEndRule: ReviewRule = {
  id: 'business/missing-end',
  category: 'process',
  severity: 'medium',
  title: 'No end node',
  description: 'The flow has no explicit terminal / outcome.',
  recommendation: 'Add an explicit end node so the completion of the process is clear.',
  domains: FLOW_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    if (ctx.scopedEntities().length < 3) return [];
    if (ctx.scopedEntities().some((e) => END_KINDS.includes(e.kind))) return [];
    return [{ key: 'no-end', affectedEntities: [], message: 'The process has no explicit end node.', evidence: ['No node of kind "end" found.'], confidence: 0.8 }];
  },
};

export const unreachableActivityRule: ReviewRule = {
  id: 'business/unreachable-activity',
  category: 'process',
  severity: 'medium',
  title: 'Unreachable activity',
  description: 'An activity that cannot be reached from the start of the process.',
  recommendation: 'Connect the activity into the flow, or remove it.',
  domains: FLOW_AND_STATE,
  evaluate(ctx: RuleContext): RuleFinding[] {
    // Prefer explicit start nodes; only if there are none, treat sources as starts.
    const explicit = ctx.scopedEntities().filter((e) => START_KINDS.includes(e.kind));
    const starts = (explicit.length > 0 ? explicit : ctx.scopedEntities().filter((e) => ctx.graph.index.incoming(e.id).length === 0 && ctx.graph.index.outgoing(e.id).length > 0)).map((e) => e.id);
    if (starts.length === 0) return [];
    const reachable = reachableFrom(ctx, starts);
    const unreachable = ctx.scopedEntities().filter((e) => !reachable.has(e.id) && ctx.graph.index.degree(e.id) > 0);
    if (unreachable.length === 0) return [];
    return [
      {
        key: 'unreachable',
        affectedEntities: unreachable.map((e) => e.id),
        message: `${unreachable.length} activit${unreachable.length === 1 ? 'y is' : 'ies are'} unreachable from the start: ${unreachable.slice(0, 4).map((e) => e.label).join(', ')}.`,
        evidence: unreachable.slice(0, 6).map((e) => `"${e.label}" is not reachable from any start.`),
        confidence: 0.8,
      },
    ];
  },
};

export const missingDecisionRule: ReviewRule = {
  id: 'business/missing-validation',
  category: 'process',
  severity: 'low',
  title: 'No approval or validation step',
  description: 'A multi-step process with no decision / approval / validation gate.',
  recommendation: 'Add a decision or approval step where the process needs a validation or a branch.',
  domains: FLOW_DOMAINS,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const entities = ctx.scopedEntities();
    if (entities.length < 4) return [];
    const hasDecision = entities.some((e) => DECISION_KINDS.includes(e.kind));
    const hasApproval = entities.some((e) => APPROVAL_RE.test(e.label));
    if (hasDecision || hasApproval) return [];
    return [
      {
        key: 'no-decision',
        affectedEntities: [],
        message: 'The process runs straight through with no approval, validation, or decision step.',
        evidence: [`${entities.length} activities, no decision/approval node.`],
        confidence: 0.6,
      },
    ];
  },
};

export const duplicateActivityRule: ReviewRule = {
  id: 'business/duplicate-activity',
  category: 'process',
  severity: 'low',
  title: 'Duplicate activity',
  description: 'Two or more activities with the same label.',
  recommendation: 'Merge duplicate activities, or rename them if they are genuinely different.',
  domains: FLOW_AND_STATE,
  evaluate(ctx: RuleContext): RuleFinding[] {
    const byLabel = new Map<string, string[]>();
    for (const e of ctx.scopedEntities()) {
      const norm = e.label.trim().toLowerCase();
      if (!norm) continue;
      const bucket = byLabel.get(norm) ?? [];
      bucket.push(e.id);
      byLabel.set(norm, bucket);
    }
    const findings: RuleFinding[] = [];
    for (const [norm, ids] of byLabel) {
      if (ids.length < 2) continue;
      findings.push({
        key: norm,
        affectedEntities: ids,
        message: `${ids.length} activities share the label "${ctx.graph.entities.get(ids[0]!)?.label}".`,
        evidence: [`${ids.length} nodes with identical labels.`],
        confidence: 0.75,
      });
    }
    return findings;
  },
};

export const BUSINESS_RULES: readonly ReviewRule[] = [
  deadEndRule,
  missingStartRule,
  missingEndRule,
  unreachableActivityRule,
  missingDecisionRule,
  duplicateActivityRule,
];
