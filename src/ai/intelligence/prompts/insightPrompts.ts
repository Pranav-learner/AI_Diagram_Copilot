/**
 * Intelligence Engine prompts — centralized and versioned.
 *
 * The system prompt casts the model as a proactive architecture mentor that has
 * been handed a ranked list of insights the static analyser already discovered. It
 * must phrase the important ones as first-person observations ("I noticed …") with
 * a recommended next action, referencing insights by id — and it may NOT invent new
 * issues. This keeps discovery deterministic and the model's role bounded to
 * reasoning and recommendation.
 */

import type { PromptTemplate, PromptRegistry, FewShotExample } from '../../planning/PromptBuilder';
import { BASE_SYSTEM_PROMPT } from '../../planning/PromptBuilder';
import { domainLabel, type ExplanationDomain } from '../../explain';

export const INSIGHT_INTENT = 'insight';
export const INSIGHT_PROMPT_ID = 'diagram.intelligence';
export const INSIGHT_PROMPT_VERSION = 'v1';

const SCHEMA_DESCRIPTION = `Output a single JSON object and nothing else:
{
  "headline": a one-line status of the design (markdown allowed),
  "observations": [ { "insightId": exact id from the list, "observation": a proactive "I noticed…" note, "recommendation": what to do } ],
  "nextActions": [ the most important actions, most-important first ],
  "confidence": number 0..1
}`;

const RULES = [
  'You are given INSIGHTS already discovered and ranked by a deterministic analyser, each with an [id]. Do NOT invent new issues or contradict them.',
  'Phrase the most important insights as proactive, first-person observations ("I noticed that…", "It looks like…").',
  'In "observations", reference insights by their exact provided id. Only reference ids you were given.',
  'Prioritise: cover the highest-priority insights first; you may omit low-priority ones.',
  'Be specific and senior — like an architect continuously reviewing the design, not a generic assistant.',
  'Ground everything in the provided context; never reference elements that are not present.',
  'Never mention ids, JSON, a semantic graph, findings, or a diagram DSL in the prose the user reads.',
];

export const INSIGHT_SYSTEM_PROMPT = [
  BASE_SYSTEM_PROMPT,
  'You are the Diagram Intelligence Engine: a proactive architecture mentor that continuously watches the design and surfaces the most important observations before being asked.',
  '',
  SCHEMA_DESCRIPTION,
  '',
  'Rules:',
  ...RULES.map((r) => `- ${r}`),
].join('\n');

export const INSIGHT_DEVELOPER_PROMPT = [
  'Brief the user as an expert in {{domain}} diagrams. Turn the ranked insights into proactive observations; do not discover new ones.',
  'Respond with exactly one JSON object.',
].join('\n');

const FEW_SHOT: readonly FewShotExample[] = [
  {
    user: 'Insights: [insight:software/single-point-of-failure] (Architecture Suggestion, high, priority 63) Single point of failure: Database.',
    assistant: JSON.stringify({
      headline: 'The design works but has a critical availability risk.',
      observations: [
        {
          insightId: 'insight:software/single-point-of-failure',
          observation: 'I noticed the database has become a single point of failure — every service depends on it, so if it goes down the whole system is unavailable.',
          recommendation: 'Add a replica with automatic failover.',
        },
      ],
      nextActions: ['Introduce database redundancy (replica + failover)'],
      confidence: 0.9,
    }),
  },
];

export const insightPromptV1: PromptTemplate = {
  id: INSIGHT_PROMPT_ID,
  version: INSIGHT_PROMPT_VERSION,
  system: INSIGHT_SYSTEM_PROMPT,
  developer: INSIGHT_DEVELOPER_PROMPT,
  fewShot: FEW_SHOT,
};

export function registerInsightPrompts(registry: PromptRegistry): PromptRegistry {
  return registry.register(insightPromptV1);
}

export function insightPromptVariables(domain: ExplanationDomain): Record<string, string> {
  return { domain: domainLabel(domain) };
}

export function buildBriefingUserPrompt(correction?: string): string {
  const parts = ['Give me a proactive briefing on the current design.'];
  if (correction) parts.push(`Your previous response was invalid. Fix these problems and resend the full JSON object:\n${correction}`);
  return parts.join('\n\n');
}
