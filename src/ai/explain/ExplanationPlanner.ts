/**
 * ExplanationPlanner — the planning layer of Explain Mode.
 *
 * It turns a raw {@link ExplainInput} (a click / selection + optional question)
 * into a fully-specified {@link ExplanationRequest}: it resolves the target's
 * label and descriptor from the Semantic Graph, **detects the domain**, chooses a
 * depth/audience/style (honouring any caller override), selects the relevant
 * content aspects, and — critically — maps the target to a compact
 * {@link ContextScope} so the LLM never receives the whole diagram. Pure and
 * deterministic; no model call happens here.
 */

import type { ContextScope, SemanticQuery } from '../understanding';
import { DEPENDENCY_KINDS } from '../understanding';
import type {
  ExplainInput,
  ExplainTarget,
  ExplanationAspect,
  ExplanationRequest,
} from './model/ExplainTypes';
import { detectDomain, defaultStyleForDomain } from './domain';
import { ExplainError } from './errors';

export class ExplanationPlanner {
  /** Plan an explanation request from raw input. Throws on an empty/invalid target. */
  plan(query: SemanticQuery, input: ExplainInput): ExplanationRequest {
    const target = input.target;
    const { label, descriptor } = describeTarget(query, target);
    const scope = scopeForTarget(query, target);

    const domain = input.domain ?? detectDomain(query.graph);
    const depth = input.depth ?? 'overview';
    const audience = input.audience ?? 'intermediate';
    const style = input.style ?? defaultStyleForDomain(domain);
    const aspects = aspectsFor(target.kind, depth, style);

    return {
      target,
      scope,
      depth,
      audience,
      style,
      domain,
      aspects,
      ...(input.question ? { question: input.question } : {}),
      targetLabel: label,
      targetDescriptor: descriptor,
    };
  }
}

// ── Target description ────────────────────────────────────────────────────────

function describeTarget(query: SemanticQuery, target: ExplainTarget): { label: string; descriptor: string } {
  switch (target.kind) {
    case 'node': {
      const e = query.getEntity(target.id);
      if (!e) throw new ExplainError(`Unknown element "${target.id}".`, 'planning');
      return { label: e.label, descriptor: `${e.kind} "${e.label}"` };
    }
    case 'relationship': {
      const r = query.getRelationship(target.id);
      if (!r) throw new ExplainError(`Unknown relationship "${target.id}".`, 'planning');
      const from = query.getEntity(r.source)?.label ?? r.source;
      const to = query.getEntity(r.target)?.label ?? r.target;
      return { label: `${from} → ${to}`, descriptor: `the "${r.kind}" relationship from ${from} to ${to}` };
    }
    case 'group':
    case 'container': {
      const g = query.getGroup(target.id);
      if (!g) throw new ExplainError(`Unknown group "${target.id}".`, 'planning');
      return { label: g.label, descriptor: `the ${target.kind} "${g.label}"` };
    }
    case 'subgraph':
    case 'selection':
    case 'timelineSegment': {
      const ids = target.ids.filter((id) => query.getEntity(id));
      if (ids.length === 0) throw new ExplainError('Nothing to explain — the selection is empty.', 'planning');
      const noun = target.kind === 'selection' ? 'selection' : target.kind === 'timelineSegment' ? 'sequence' : 'subgraph';
      const labels = ids.slice(0, 3).map((id) => query.getEntity(id)!.label);
      const label = labels.join(target.kind === 'timelineSegment' ? ' → ' : ', ') + (ids.length > 3 ? ', …' : '');
      return { label, descriptor: `a ${noun} of ${ids.length} element${ids.length === 1 ? '' : 's'}` };
    }
    case 'diagram':
      return { label: 'the whole diagram', descriptor: 'the entire diagram' };
    case 'path': {
      const from = query.getEntity(target.from)?.label ?? target.from;
      const to = query.getEntity(target.to)?.label ?? target.to;
      return { label: `${from} → ${to}`, descriptor: `the path from ${from} to ${to}` };
    }
    case 'dependencyChain': {
      const e = query.getEntity(target.id);
      if (!e) throw new ExplainError(`Unknown element "${target.id}".`, 'planning');
      return { label: `${e.label} dependencies`, descriptor: `the dependency chain starting at "${e.label}"` };
    }
  }
}

// ── Scope selection (keeps the LLM's context minimal) ────────────────────────

function scopeForTarget(query: SemanticQuery, target: ExplainTarget): ContextScope {
  switch (target.kind) {
    case 'node':
      return { kind: 'entity', id: target.id };
    case 'relationship': {
      const r = query.getRelationship(target.id);
      const ids = r ? [r.source, r.target] : [];
      return { kind: 'subgraph', ids };
    }
    case 'group':
    case 'container':
      return { kind: 'group', id: target.id };
    case 'subgraph':
    case 'selection':
    case 'timelineSegment':
      return { kind: target.kind === 'selection' ? 'selection' : 'subgraph', ids: target.ids };
    case 'diagram':
      return { kind: 'whole' };
    case 'path':
      return { kind: 'path', from: target.from, to: target.to };
    case 'dependencyChain': {
      const chain = new Set<string>([target.id]);
      for (const e of query.findReachable(target.id, { direction: 'out', relKinds: DEPENDENCY_KINDS })) chain.add(e.id);
      return { kind: 'subgraph', ids: [...chain] };
    }
  }
}

// ── Aspect selection ─────────────────────────────────────────────────────────

function aspectsFor(kind: ExplainTarget['kind'], depth: string, style: string): ExplanationAspect[] {
  const base: ExplanationAspect[] = [];
  switch (kind) {
    case 'node':
    case 'group':
    case 'container':
      base.push('purpose', 'responsibilities', 'relationships');
      break;
    case 'relationship':
      base.push('purpose', 'relationships', 'tradeoffs');
      break;
    case 'diagram':
      base.push('purpose', 'designDecisions', 'relationships', 'tradeoffs');
      break;
    case 'path':
    case 'dependencyChain':
      base.push('relationships', 'tradeoffs', 'commonMistakes');
      break;
    case 'subgraph':
    case 'selection':
    case 'timelineSegment':
      base.push('purpose', 'responsibilities', 'relationships');
      break;
  }
  if (depth === 'detailed') base.push('bestPractices', 'commonMistakes', 'tradeoffs', 'alternatives');
  if (style === 'educational') base.push('examples');
  // De-duplicate while preserving order.
  return [...new Set(base)];
}
