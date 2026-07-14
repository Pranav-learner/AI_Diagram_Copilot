/**
 * StatementExtractor — deterministic extraction of goals, risks, constraints, and
 * assumptions.
 *
 * These are detected from their enclosing section headings (Goals/Objectives,
 * Risks, Constraints/Limitations, Assumptions) and from inline lead-ins
 * ("Risk:", "Assumption:", …). Each becomes a statement entity of the matching
 * kind with the full text as description — completing the spec's knowledge
 * categories alongside the entity/requirement/decision extractors.
 */

import type { StructuredDocument } from '../documents/StructuredDocument';
import type { EntityKind } from '../pkm/KnowledgeEntity';
import type { ExtractedEntity, Extractor, ExtractionResult } from './types';
import { makeEvidence, textNodes, underHeading } from './types';
import { shortLabel } from '../util';

interface Rule {
  readonly kind: EntityKind;
  readonly heading: RegExp;
  readonly inline: RegExp;
}

const RULES: readonly Rule[] = [
  { kind: 'goal', heading: /\b(goals?|objectives?)\b/, inline: /^(?:goal|objective)s?\s*[:-]/i },
  { kind: 'risk', heading: /\b(risks?)\b/, inline: /^risks?\s*[:-]/i },
  { kind: 'constraint', heading: /\b(constraints?|limitations?)\b/, inline: /^(?:constraint|limitation)s?\s*[:-]/i },
  { kind: 'assumption', heading: /\b(assumptions?)\b/, inline: /^assumptions?\s*[:-]/i },
];

export const statementExtractor: Extractor = {
  id: 'statement',
  extract(doc: StructuredDocument): ExtractionResult {
    const entities: ExtractedEntity[] = [];

    for (const ctx of textNodes(doc)) {
      if (ctx.node.type !== 'paragraph' && ctx.node.type !== 'listItem') continue;
      for (const rule of RULES) {
        const byHeading = underHeading(ctx, rule.heading) && ctx.node.type === 'listItem';
        const byInline = rule.inline.test(ctx.text);
        if (!byHeading && !byInline) continue;
        const text = ctx.text.replace(rule.inline, '').trim() || ctx.text;
        entities.push({
          name: shortLabel(text),
          kind: rule.kind,
          category: ctx.category,
          confidence: byInline ? 0.7 : 0.6,
          description: text,
          evidence: makeEvidence(doc, ctx),
        });
        break; // one classification per node
      }
    }

    return { entities, relations: [] };
  },
};
