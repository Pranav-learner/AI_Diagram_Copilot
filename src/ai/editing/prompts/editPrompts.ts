/**
 * Conversational-editing prompts — centralized and versioned.
 *
 * The system prompt teaches the model the EditPlan contract and, critically, the
 * **referencing discipline**: commit to an id it read from the context when it is
 * confident, but defer to a `descriptor` (so the app can ask) when the user's
 * phrase could match several elements — never guess. Positions are relative
 * ("below the User Service"); the app computes coordinates.
 */

import type { PromptTemplate, PromptRegistry, FewShotExample } from '../../planning/PromptBuilder';
import { BASE_SYSTEM_PROMPT } from '../../planning/PromptBuilder';

export const EDIT_INTENT = 'edit';
export const EDIT_PROMPT_ID = 'diagram.edit';
export const EDIT_PROMPT_VERSION = 'v1';

const SCHEMA_DESCRIPTION = `Output a single JSON EditPlan:
{
  "summary": short human description of the change,
  "edits": [ one or more of:
    { "op":"add_node", "ref": local-id, "label": string, "nodeType"?: role, "near"?: Reference, "direction"?: above|below|left|right, "group"?: groupLabel },
    { "op":"remove_node", "target": Reference },
    { "op":"rename_node", "target": Reference, "label": string },
    { "op":"move_node", "target": Reference, "to": { "relativeTo"?: Reference, "direction"?: above|below|left|right, "delta"?: {dx,dy} } },
    { "op":"resize_node", "target": Reference, "size"?: {width?,height?}, "scale"?: number },
    { "op":"connect", "source": Reference, "target": Reference, "label"?: string, "direction"?: forward|back|both|none },
    { "op":"disconnect", "source": Reference, "target": Reference },
    { "op":"update_style", "targets": [Reference], "style": { "fill"?: colorName, "stroke"?: colorName, "emphasize"?: bool } },
    { "op":"update_metadata", "target": Reference, "key": string, "value": string|number|bool },
    { "op":"group", "targets": [Reference], "label": string },
    { "op":"ungroup", "target": Reference },
    { "op":"reorder", "target": Reference, "position": front|back|forward|backward }
  ],
  "confidence": 0..1
}
A Reference is one of:
  { "by":"id", "id": exact id from the diagram context }         ← prefer this when you know the element
  { "by":"label", "label": text }
  { "by":"selection", "index"?: n }                              ← "these" / "the selected"
  { "by":"new", "ref": a ref you used in an add_node this plan }
  { "by":"descriptor", "text": phrase }                          ← use when it may match SEVERAL (the app will ask)
  { "by":"superlative", "metric": largest|smallest|leftmost|rightmost|topmost|bottommost }`;

const RULES = [
  'You EDIT the existing diagram described in the context. Use the real ids/labels from that context.',
  'Prefer { by:"id" } when you are confident which element the user means.',
  'If the reference is genuinely ambiguous (could be several elements), use { by:"descriptor" } — DO NOT pick one arbitrarily; the application will ask the user.',
  'Use { by:"selection" } for "these", "the selected", "this".',
  'Reference a node you add in the same plan with { by:"new", ref }.',
  'NEVER include coordinates, pixel sizes, hex colours, or shapes. Express position relatively (relativeTo + direction) and colours by name.',
  'Only include edits the user asked for. Output ONLY the JSON object.',
];

export const EDIT_SYSTEM_PROMPT = [
  BASE_SYSTEM_PROMPT,
  'You modify an existing diagram by producing a semantic EditPlan. You never draw, position, or mutate anything directly — you describe intent, and the application validates, resolves references, previews, and executes.',
  '',
  SCHEMA_DESCRIPTION,
  '',
  'Rules:',
  ...RULES.map((r) => `- ${r}`),
].join('\n');

export const EDIT_DEVELOPER_PROMPT = [
  'Respond with exactly one JSON EditPlan and nothing else.',
  'Every Reference must resolve to an element in the provided diagram context (or a { by:"new" } node you add in this plan).',
].join('\n');

const FEW_SHOT: readonly FewShotExample[] = [
  {
    user: 'Add Redis between the API and the Database.',
    assistant: JSON.stringify({
      summary: 'Insert a Redis cache between API and Database',
      edits: [
        { op: 'add_node', ref: 'redis', label: 'Redis', nodeType: 'cache', near: { by: 'label', label: 'API' }, direction: 'right' },
        { op: 'connect', source: { by: 'label', label: 'API' }, target: { by: 'new', ref: 'redis' } },
        { op: 'connect', source: { by: 'new', ref: 'redis' }, target: { by: 'label', label: 'Database' } },
      ],
      confidence: 0.9,
    }),
  },
];

export const editPromptV1: PromptTemplate = {
  id: EDIT_PROMPT_ID,
  version: EDIT_PROMPT_VERSION,
  system: EDIT_SYSTEM_PROMPT,
  developer: EDIT_DEVELOPER_PROMPT,
  fewShot: FEW_SHOT,
};

export function registerEditPrompts(registry: PromptRegistry): PromptRegistry {
  return registry.register(editPromptV1);
}

export interface EditUserPromptOptions {
  readonly selectionCount?: number;
  readonly regenerate?: boolean;
  readonly correction?: string;
  /** A disambiguation the user chose, to pin an ambiguous reference. */
  readonly disambiguation?: string;
}

export function buildEditUserPrompt(prompt: string, options: EditUserPromptOptions = {}): string {
  const parts = [prompt.trim()];
  if (options.selectionCount) parts.push(`(${options.selectionCount} element(s) are currently selected.)`);
  if (options.disambiguation) parts.push(options.disambiguation);
  if (options.regenerate) parts.push('Produce a different interpretation of this request.');
  if (options.correction) parts.push(`Your previous plan was invalid. Fix these problems and resend the full EditPlan:\n${options.correction}`);
  return parts.join('\n\n');
}
