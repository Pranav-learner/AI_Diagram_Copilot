/**
 * IntentAnalyzer — classifies a user request into a capability.
 *
 * This is the fan-out point of the whole platform: the classified {@link Intent}
 * selects which future feature (generate, edit, explain, review, import, export)
 * handles the turn. The analyzer is an interface with two shipped strategies —
 * a deterministic {@link RuleBasedIntentAnalyzer} (fast, free, testable, the
 * default) and an {@link LLMIntentAnalyzer} (uses the model for ambiguous
 * phrasing). Intents are open strings anchored by {@link KNOWN_INTENTS}, so a
 * new capability registers a new intent without editing a closed enum.
 */

import { z } from 'zod';
import type { ChatMessage } from '../core/types';
import type { AIService } from '../core/AIService';
import { ResponseValidator } from '../validation/ResponseValidator';
import { ConfidenceSchema } from '../validation/schemas/common';
import { IntentError } from '../core/AIError';

/** The built-in intents. The union stays open (`string`) for future features. */
export const KNOWN_INTENTS = ['generate', 'edit', 'explain', 'review', 'import', 'export', 'unknown'] as const;
export type Intent = (typeof KNOWN_INTENTS)[number] | (string & {});

/** What the analyzer sees: the raw text plus lightweight situational signals. */
export interface IntentInput {
  readonly text: string;
  /** Whether a diagram already exists (edit/explain/review imply one). */
  readonly hasDiagram?: boolean;
  /** Whether elements are currently selected. */
  readonly hasSelection?: boolean;
  /** Recent conversation, for context-sensitive classification. */
  readonly history?: readonly ChatMessage[];
}

export interface IntentClassification {
  readonly intent: Intent;
  /** Confidence in [0,1]. */
  readonly confidence: number;
  readonly reason?: string;
  /** Runner-up intents, best-first, for disambiguation UIs. */
  readonly alternatives?: readonly Intent[];
}

export interface IntentAnalyzer {
  analyze(input: IntentInput): IntentClassification | Promise<IntentClassification>;
}

// ── Rule-based (default) ────────────────────────────────────────────────────

interface IntentRule {
  readonly intent: Intent;
  readonly patterns: readonly RegExp[];
  /** Requires an existing diagram to fire (e.g. edit/explain/review). */
  readonly needsDiagram?: boolean;
}

const RULES: readonly IntentRule[] = [
  { intent: 'generate', patterns: [/\b(create|generate|draw|make|build|design|new)\b/i] },
  {
    intent: 'edit',
    patterns: [/\b(add|remove|delete|move|rename|connect|change|update|resize|recolor|arrange)\b/i],
    needsDiagram: true,
  },
  { intent: 'explain', patterns: [/\b(explain|describe|what does|what is|walk me through|summar)\b/i], needsDiagram: true },
  { intent: 'review', patterns: [/\b(review|check|critique|improve|feedback|issues?|problems?)\b/i], needsDiagram: true },
  { intent: 'import', patterns: [/\b(import|parse|convert from|from (mermaid|json|code|text))\b/i] },
  { intent: 'export', patterns: [/\b(export|download|save as|to (png|svg|pdf|mermaid))\b/i] },
];

export interface RuleBasedOptions {
  /** Confidence assigned to a clear single-intent match. */
  readonly matchConfidence?: number;
}

export class RuleBasedIntentAnalyzer implements IntentAnalyzer {
  private readonly matchConfidence: number;

  constructor(options: RuleBasedOptions = {}) {
    this.matchConfidence = options.matchConfidence ?? 0.7;
  }

  analyze(input: IntentInput): IntentClassification {
    const scores = new Map<Intent, number>();
    for (const rule of RULES) {
      if (rule.needsDiagram && input.hasDiagram === false) continue;
      const hits = rule.patterns.reduce((n, re) => n + (re.test(input.text) ? 1 : 0), 0);
      if (hits > 0) scores.set(rule.intent, hits);
    }

    if (scores.size === 0) {
      // No diagram + no verb usually means "make me one".
      const fallback: Intent = input.hasDiagram ? 'unknown' : 'generate';
      return { intent: fallback, confidence: input.hasDiagram ? 0.2 : 0.4, reason: 'no rule matched' };
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const [topIntent, topScore] = ranked[0]!;
    const second = ranked[1];
    // Sharpen confidence when the winner clearly leads; soften on ties.
    const lead = second ? topScore - second[1] : topScore;
    const confidence = Math.min(1, this.matchConfidence + 0.1 * (lead - 1));
    return {
      intent: topIntent,
      confidence: Math.max(0.4, confidence),
      reason: `matched ${topScore} rule pattern(s)`,
      alternatives: ranked.slice(1).map(([i]) => i),
    };
  }
}

// ── LLM-based ───────────────────────────────────────────────────────────────

const IntentSchema = z.object({
  intent: z.string().min(1),
  confidence: ConfidenceSchema,
  reason: z.string().optional(),
});

const INTENT_SYSTEM_PROMPT = [
  'You are an intent classifier for a diagram assistant.',
  `Classify the user's request into exactly one of: ${KNOWN_INTENTS.join(', ')}.`,
  'Respond ONLY with JSON: {"intent": string, "confidence": number (0-1), "reason": string}.',
].join('\n');

export interface LLMIntentAnalyzerDeps {
  readonly service: AIService;
  readonly validator?: ResponseValidator;
  /** Falls back to this analyzer when the model output is unusable. */
  readonly fallback?: IntentAnalyzer;
}

/** Classifies via the model; delegates to a rule-based fallback on failure. */
export class LLMIntentAnalyzer implements IntentAnalyzer {
  private readonly service: AIService;
  private readonly validator: ResponseValidator;
  private readonly fallback: IntentAnalyzer;

  constructor(deps: LLMIntentAnalyzerDeps) {
    this.service = deps.service;
    this.validator = deps.validator ?? new ResponseValidator();
    this.fallback = deps.fallback ?? new RuleBasedIntentAnalyzer();
  }

  async analyze(input: IntentInput): Promise<IntentClassification> {
    let text: string;
    try {
      const response = await this.service.complete(
        {
          messages: [
            { role: 'system', content: INTENT_SYSTEM_PROMPT },
            { role: 'user', content: input.text },
          ],
          responseFormat: { type: 'json' },
        },
        { tier: 'fast', intent: 'classify' },
      );
      text = response.text;
    } catch (err) {
      if (err instanceof IntentError) throw err;
      return this.fallback.analyze(input);
    }

    const result = this.validator.validate(text, IntentSchema);
    if (!result.ok) return this.fallback.analyze(input);
    const intent = normalizeIntent(result.value.intent);
    return { intent, confidence: result.value.confidence, reason: result.value.reason };
  }
}

/** Snap free-form model output to a known intent, else `unknown`. */
function normalizeIntent(raw: string): Intent {
  const lower = raw.trim().toLowerCase();
  return (KNOWN_INTENTS as readonly string[]).includes(lower) ? (lower as Intent) : 'unknown';
}
