/**
 * Explain Mode prompts — centralized and versioned.
 *
 * The system prompt casts the model as an experienced mentor who reasons over the
 * **semantic context block** (never the raw diagram) and adapts to three dials:
 * audience (beginner/intermediate/expert), style (business/technical/educational),
 * and the detected domain. Those dials are injected on the higher-authority
 * developer channel as `{{variables}}`, so the same template produces a beginner
 * business summary or an expert technical deep-dive without branching code.
 */

import type { PromptTemplate, PromptRegistry, FewShotExample } from '../../planning/PromptBuilder';
import { BASE_SYSTEM_PROMPT } from '../../planning/PromptBuilder';
import type { ExplanationRequest } from '../model/ExplainTypes';
import { domainLabel } from '../domain';

export const EXPLAIN_INTENT = 'explain';
export const EXPLAIN_PROMPT_ID = 'diagram.explain';
export const EXPLAIN_PROMPT_VERSION = 'v1';

const SCHEMA_DESCRIPTION = `Output a single JSON object and nothing else:
{
  "summary": a 1-3 sentence plain-language gist of what the focus is and why it matters,
  "keyPoints": [ up to 8 short, scannable takeaways ],           ← always include
  "sections": [ { "heading": string, "body": markdown } ],       ← include ONLY when depth is "detailed"
  "confidence": number 0..1
}
Section bodies may use markdown (bold, bullet lists, \`code\`). Do NOT output a top-level title, the raw element ids, or anything outside the JSON.`;

const AUDIENCE_GUIDE = [
  'Adapt to the audience:',
  '- beginner: assume no prior knowledge; define terms plainly; use analogies.',
  '- intermediate: assume working familiarity; be concise and practical.',
  '- expert: assume deep expertise; focus on trade-offs, failure modes, and design rationale; skip the basics.',
].join('\n');

const STYLE_GUIDE = [
  'Adapt to the style:',
  '- business: emphasise purpose, value, cost, and risk; minimal jargon.',
  '- technical: be precise and implementation-aware.',
  '- educational: teach the concept; use examples and analogies.',
].join('\n');

const RULES = [
  'Explain ONLY the focus element(s), using the surrounding context to ground the explanation.',
  'Use only the elements, ids, labels, and relationships present in the provided context — NEVER invent components, connections, or technologies that are not there.',
  'When you name a related element, use its label from the context.',
  'Be accurate about direction: respect which element depends on / calls / produces to which.',
  'Prefer concrete, specific statements over generic filler. If the context is thin, say what can be inferred and no more.',
  'Never mention that you are reading a JSON context, a semantic graph, ids, or a diagram DSL.',
];

export const EXPLAIN_SYSTEM_PROMPT = [
  BASE_SYSTEM_PROMPT,
  'You are Explain Mode: an experienced mentor who helps a user understand a diagram they are looking at. You explain what things are, why they exist, how they relate, and the trade-offs involved — like a knowledgeable colleague, not a dictionary.',
  '',
  SCHEMA_DESCRIPTION,
  '',
  AUDIENCE_GUIDE,
  '',
  STYLE_GUIDE,
  '',
  'Rules:',
  ...RULES.map((r) => `- ${r}`),
].join('\n');

export const EXPLAIN_DEVELOPER_PROMPT = [
  'Explain for a {{audience}} audience in a {{style}} register, speaking as an expert in {{domain}} diagrams.',
  'Depth: {{depth}}. Emphasise these aspects where relevant: {{aspects}}.',
  'Respond with exactly one JSON Explanation object grounded strictly in the provided context.',
].join('\n');

const FEW_SHOT: readonly FewShotExample[] = [
  {
    user: 'Explain the cache "Redis". It sits between the API Gateway and the Postgres database.',
    assistant: JSON.stringify({
      summary:
        'Redis is an in-memory cache placed between the API Gateway and Postgres to serve frequently-read data quickly and take load off the database.',
      keyPoints: [
        'Absorbs repeated reads so Postgres handles fewer queries',
        'Cuts response latency for hot data to sub-millisecond',
        'Adds a cache-invalidation concern to keep data fresh',
      ],
      confidence: 0.9,
    }),
  },
];

export const explainPromptV1: PromptTemplate = {
  id: EXPLAIN_PROMPT_ID,
  version: EXPLAIN_PROMPT_VERSION,
  system: EXPLAIN_SYSTEM_PROMPT,
  developer: EXPLAIN_DEVELOPER_PROMPT,
  fewShot: FEW_SHOT,
};

export function registerExplainPrompts(registry: PromptRegistry): PromptRegistry {
  return registry.register(explainPromptV1);
}

/** The `{{variables}}` the developer channel interpolates from a planned request. */
export function explainPromptVariables(request: ExplanationRequest): Record<string, string> {
  return {
    audience: request.audience,
    style: request.style,
    domain: domainLabel(request.domain),
    depth: request.depth,
    aspects: request.aspects.join(', '),
  };
}

export interface ExplainUserPromptOptions {
  readonly correction?: string;
}

/** Compose the user turn: the request (or a default framing) + a depth hint. */
export function buildExplainUserPrompt(request: ExplanationRequest, options: ExplainUserPromptOptions = {}): string {
  const parts: string[] = [];
  parts.push(request.question?.trim() || `Explain ${request.targetDescriptor}.`);
  parts.push(
    request.depth === 'detailed'
      ? 'Give a thorough explanation with headed sections plus key points.'
      : 'Give a concise overview: a short summary and key points (no sections).',
  );
  if (options.correction) {
    parts.push(`Your previous response was invalid. Fix these problems and resend the full JSON object:\n${options.correction}`);
  }
  return parts.join('\n\n');
}
