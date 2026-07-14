/**
 * Diagram Review prompts — centralized and versioned.
 *
 * The system prompt frames the model as a senior reviewer who has been handed the
 * output of a static analyser. The single most important instruction: **do not
 * rediscover or invent issues** — explain, prioritise, and contextualise the
 * findings the application already computed, referencing them by id. This is what
 * keeps discovery deterministic and the model's role bounded to reasoning.
 */

import type { PromptTemplate, PromptRegistry, FewShotExample } from '../../planning/PromptBuilder';
import { BASE_SYSTEM_PROMPT } from '../../planning/PromptBuilder';
import { domainLabel, type ExplanationDomain } from '../../explain';

export const REVIEW_INTENT = 'review';
export const REVIEW_PROMPT_ID = 'diagram.review';
export const REVIEW_PROMPT_VERSION = 'v1';

const SCHEMA_DESCRIPTION = `Output a single JSON object and nothing else:
{
  "summary": a concise narrative overview of the review (markdown allowed),
  "strengths": [ up to 10 things the design does well ],
  "priorityActions": [ the most important actions, most-important first ],
  "findingNotes": [ { "findingId": exact id from the provided findings, "note": explanation / trade-off / context } ],
  "tradeoffs": [ notable trade-offs to weigh ],
  "confidence": number 0..1
}`;

const RULES = [
  'You are given findings ALREADY DISCOVERED by a deterministic static analyser, each with an [id]. Do NOT invent new issues or contradict the findings.',
  'Your job: explain what each finding means and why it matters, prioritise them, note trade-offs, and give actionable recommendations.',
  'In "findingNotes", reference findings by their exact provided id. Only reference ids that were given to you.',
  'Ground everything in the provided context — never reference elements that are not present.',
  'Be specific and senior — like an architect in a design review, not a generic checklist.',
  'Never mention ids, JSON, a semantic graph, or a diagram DSL in prose the user reads.',
];

export const REVIEW_SYSTEM_PROMPT = [
  BASE_SYSTEM_PROMPT,
  'You are Diagram Review: an experienced architect performing a design review. The application has already run static analysis over the diagram and computed findings and scores; you interpret them.',
  '',
  SCHEMA_DESCRIPTION,
  '',
  'Rules:',
  ...RULES.map((r) => `- ${r}`),
].join('\n');

export const REVIEW_DEVELOPER_PROMPT = [
  'Review this as an expert in {{domain}} diagrams for a {{audience}} audience.',
  'Explain and prioritise the provided findings; do not discover new ones. Respond with exactly one JSON object.',
].join('\n');

const FEW_SHOT: readonly FewShotExample[] = [
  {
    user: 'Review findings: [software/single-point-of-failure#db] (high/availability) Single point of failure: Database.',
    assistant: JSON.stringify({
      summary: 'The design is functional but has a critical availability risk: the database is a single point of failure.',
      strengths: ['Clear separation between services and data'],
      priorityActions: ['Add a database replica with automatic failover'],
      findingNotes: [
        { findingId: 'software/single-point-of-failure#db', note: 'Every service depends on this one database; if it goes down the whole system is unavailable. A replica or managed HA setup removes the single point of failure.' },
      ],
      tradeoffs: ['Replication adds operational cost and eventual-consistency considerations'],
      confidence: 0.9,
    }),
  },
];

export const reviewPromptV1: PromptTemplate = {
  id: REVIEW_PROMPT_ID,
  version: REVIEW_PROMPT_VERSION,
  system: REVIEW_SYSTEM_PROMPT,
  developer: REVIEW_DEVELOPER_PROMPT,
  fewShot: FEW_SHOT,
};

export function registerReviewPrompts(registry: PromptRegistry): PromptRegistry {
  return registry.register(reviewPromptV1);
}

export function reviewPromptVariables(domain: ExplanationDomain, audience = 'intermediate'): Record<string, string> {
  return { domain: domainLabel(domain), audience };
}

export interface ReviewUserPromptOptions {
  readonly request?: string;
  readonly correction?: string;
}

export function buildReviewUserPrompt(options: ReviewUserPromptOptions = {}): string {
  const parts: string[] = [];
  parts.push(options.request?.trim() || 'Review this diagram: explain the findings, prioritise them, and recommend improvements.');
  if (options.correction) parts.push(`Your previous response was invalid. Fix these problems and resend the full JSON object:\n${options.correction}`);
  return parts.join('\n\n');
}
