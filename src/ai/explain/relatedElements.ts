/**
 * Related elements + suggested questions — derived from the Semantic Graph, not
 * the model.
 *
 * The spec is explicit: contextual suggestions ("explain this dependency",
 * "explain the parent group", "show downstream effects") must come from the graph.
 * These are deterministic functions of the {@link SemanticQuery}, so they are
 * free, instant, always accurate, and never hallucinated. The UI renders them as
 * one-click follow-ups that re-enter the pipeline scoped to the new target.
 */

import type { SemanticEntity, SemanticQuery } from '../understanding';
import type { ExplanationRequest, RelatedElement } from './model/ExplainTypes';

const MAX_RELATED = 6;
const MAX_QUESTIONS = 5;

function toRelated(entity: SemanticEntity, relation: string): RelatedElement {
  return {
    id: entity.id,
    label: entity.label,
    kind: entity.kind,
    relation,
    question: `Explain "${entity.label}" and its role here.`,
  };
}

/** Build the ranked list of related elements for a planned explanation. */
export function deriveRelatedElements(query: SemanticQuery, request: ExplanationRequest): RelatedElement[] {
  const seen = new Set<string>();
  const out: RelatedElement[] = [];
  const add = (entity: SemanticEntity | undefined, relation: string) => {
    if (!entity || seen.has(entity.id) || out.length >= MAX_RELATED) return;
    seen.add(entity.id);
    out.push(toRelated(entity, relation));
  };

  const target = request.target;
  if (target.kind === 'node') {
    const id = target.id;
    for (const e of query.findDependencies(id)) add(e, 'depends on');
    for (const e of query.findDependents(id)) add(e, 'depends on this');
    for (const e of query.findConsumers(id)) add(e, 'downstream');
    for (const e of query.findNeighbors(id)) add(e, 'connected to');
    const groupId = query.getEntity(id)?.groupId;
    if (groupId) {
      const g = query.getGroup(groupId);
      if (g && !seen.has(g.id) && out.length < MAX_RELATED) {
        out.push({ id: g.id, label: g.label, kind: 'group', relation: 'parent group', question: `Explain the "${g.label}" group.` });
      }
    }
  } else if (target.kind === 'relationship') {
    const r = query.getRelationship(target.id);
    if (r) {
      add(query.getEntity(r.source), 'source');
      add(query.getEntity(r.target), 'target');
    }
  } else if (target.kind === 'group' || target.kind === 'container') {
    for (const e of query.findMembers(target.id)) add(e, 'member');
  } else if (target.kind === 'diagram') {
    // Surface the structural hubs — the most connected, most explanation-worthy.
    const hubs = query
      .topology()
      .hubs.map((hid) => query.getEntity(hid))
      .filter((e): e is SemanticEntity => !!e);
    for (const e of hubs) add(e, 'central hub');
  } else if ('ids' in target) {
    for (const eid of target.ids) add(query.getEntity(eid), 'member');
  } else if (target.kind === 'path' || target.kind === 'dependencyChain') {
    const focusId = target.kind === 'path' ? target.from : target.id;
    for (const e of query.findDependencies(focusId)) add(e, 'depends on');
    for (const e of query.findNeighbors(focusId)) add(e, 'connected to');
  }

  return out;
}

/**
 * Suggested follow-up questions — a blend of graph-aware prompts (downstream
 * effects only when there *are* dependents) and depth/alternatives toggles.
 */
export function suggestFollowUpQuestions(query: SemanticQuery, request: ExplanationRequest): string[] {
  const questions: string[] = [];
  const target = request.target;

  if (target.kind === 'node') {
    const entity = query.getEntity(target.id);
    const kind = entity?.kind ?? 'element';
    questions.push('Why is this needed here?');
    if (query.findDependents(target.id).length > 0 || query.findConsumers(target.id).length > 0) {
      questions.push('What happens downstream if this fails?');
    }
    questions.push(`What are the alternatives to this ${kind}?`);
    questions.push('What are the trade-offs of this choice?');
  } else if (target.kind === 'relationship') {
    questions.push('Why are these two connected?', 'What data or control flows across this?', 'What would break if this link were removed?');
  } else if (target.kind === 'group' || target.kind === 'container') {
    questions.push('What is the responsibility of this group?', 'How do the members interact?', 'Could this be decomposed differently?');
  } else if (target.kind === 'diagram') {
    questions.push('Walk me through the main flow.', 'What are the biggest risks in this design?', 'What would you improve?', 'Explain this to a non-technical stakeholder.');
  } else {
    questions.push('How do these elements relate?', 'What is the purpose of this part of the diagram?');
  }

  // Depth toggle is always useful.
  questions.push(request.depth === 'overview' ? 'Explain this in more detail.' : 'Give me the short version.');
  return [...new Set(questions)].slice(0, MAX_QUESTIONS);
}
