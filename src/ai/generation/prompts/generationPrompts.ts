/**
 * Diagram-generation prompts — centralized, versioned, reusable.
 *
 * All generation prompting lives here (never scattered at call sites). The
 * system prompt teaches the model the DiagramPlan contract; the developer
 * channel enforces hard output rules; a compact few-shot anchors the JSON shape.
 * The prompt is deliberately **semantic-only** — it forbids coordinates, sizes,
 * colours, and shapes, because those are the application's job. Registered under
 * a stable id + version so a `v2` can be A/B-tested without deleting `v1`.
 */

import type { PromptTemplate, PromptRegistry, FewShotExample } from '../../planning/PromptBuilder';
import { BASE_SYSTEM_PROMPT } from '../../planning/PromptBuilder';
import { DIAGRAM_TYPES } from '../model/DiagramType';
import { RELATIONSHIP_TYPES } from '../model/DiagramPlan';
import type { DiagramType } from '../model/DiagramType';

export const GENERATION_INTENT = 'generate';
export const GENERATION_PROMPT_ID = 'diagram.generate';
export const GENERATION_PROMPT_VERSION = 'v1';

const SCHEMA_DESCRIPTION = `Output a single JSON object (the DiagramPlan) with this shape:
{
  "diagramType": one of [${DIAGRAM_TYPES.join(', ')}],
  "title": string,
  "description": string (optional, one sentence),
  "layout": optional hint: hierarchical | tree | flow | radial | mindmap | grid | horizontal | vertical,
  "nodes": [ { "id": kebab-case unique string, "label": string, "type": semantic role (e.g. service, database, decision, actor, entity, state, class, event), "description"?: string, "group"?: groupId, "parent"?: nodeId } ],
  "relationships": [ { "source": nodeId, "target": nodeId, "label"?: string, "type"?: one of [${RELATIONSHIP_TYPES.join(', ')}], "direction"?: forward|back|both|none } ],
  "groups": optional [ { "id": string, "label": string, "nodeIds": [nodeId] } ],
  "annotations": optional [ { "text": string, "target"?: nodeId } ],
  "styling": optional { "theme"?: light|dark|neutral|colorful, "emphasize"?: [nodeId] },
  "confidence": number 0..1
}`;

const RULES = [
  'Think about the domain and produce a COMPLETE, sensible diagram (typically 4-15 nodes).',
  'Choose the single best diagramType for the request.',
  'Use stable, unique, kebab-case node ids. Reference them exactly in relationships/groups/parent.',
  'Express structure via relationships and (for trees/mind-maps) parent — the application computes all positions.',
  'NEVER include coordinates, x/y, width/height, pixel sizes, colours, hex values, or shapes. Those are chosen by the application.',
  'Keep it semantic: describe meaning (node.type), not appearance.',
  'Output ONLY the JSON object — no prose, no markdown fences, no comments.',
];

export const SYSTEM_PROMPT = [
  BASE_SYSTEM_PROMPT,
  'You design diagrams by producing a strongly-typed, semantic DiagramPlan. You never draw or position anything — you describe structure and meaning.',
  '',
  SCHEMA_DESCRIPTION,
  '',
  'Rules:',
  ...RULES.map((r) => `- ${r}`),
].join('\n');

export const DEVELOPER_PROMPT = [
  'Respond with exactly one JSON object matching the DiagramPlan schema and nothing else.',
  'Every relationship source/target MUST be an existing node id. Do not invent ids only used once.',
  'If the user names a diagram type, honour it unless it is clearly wrong for the request.',
].join('\n');

const FEW_SHOT: readonly FewShotExample[] = [
  {
    user: 'Draw a simple login flow.',
    assistant: JSON.stringify({
      diagramType: 'flowchart',
      title: 'Login Flow',
      layout: 'hierarchical',
      nodes: [
        { id: 'start', label: 'Start', type: 'start' },
        { id: 'enter-credentials', label: 'Enter credentials', type: 'input' },
        { id: 'validate', label: 'Valid credentials?', type: 'decision' },
        { id: 'dashboard', label: 'Go to dashboard', type: 'process' },
        { id: 'show-error', label: 'Show error', type: 'process' },
        { id: 'end', label: 'End', type: 'end' },
      ],
      relationships: [
        { source: 'start', target: 'enter-credentials' },
        { source: 'enter-credentials', target: 'validate' },
        { source: 'validate', target: 'dashboard', label: 'yes' },
        { source: 'validate', target: 'show-error', label: 'no' },
        { source: 'show-error', target: 'enter-credentials' },
        { source: 'dashboard', target: 'end' },
      ],
      confidence: 0.9,
    }),
  },
];

export const generationPromptV1: PromptTemplate = {
  id: GENERATION_PROMPT_ID,
  version: GENERATION_PROMPT_VERSION,
  system: SYSTEM_PROMPT,
  developer: DEVELOPER_PROMPT,
  fewShot: FEW_SHOT,
};

/** Register the generation prompt template(s) into a registry. Chainable. */
export function registerGenerationPrompts(registry: PromptRegistry): PromptRegistry {
  return registry.register(generationPromptV1);
}

export interface UserPromptOptions {
  readonly diagramType?: DiagramType;
  /** Ask for a different variation (regenerate). */
  readonly regenerate?: boolean;
  /** Validation feedback to self-correct a previous malformed/invalid attempt. */
  readonly correction?: string;
}

/** Compose the user turn from the raw request plus optional hints/feedback. */
export function buildGenerationUserPrompt(prompt: string, options: UserPromptOptions = {}): string {
  const parts = [prompt.trim()];
  if (options.diagramType) parts.push(`Preferred diagram type: ${options.diagramType}.`);
  if (options.regenerate) parts.push('Produce a distinct alternative to any previous attempt — different structure or emphasis.');
  if (options.correction) parts.push(`Your previous attempt was invalid. Fix these problems and resend the full JSON:\n${options.correction}`);
  return parts.join('\n\n');
}
