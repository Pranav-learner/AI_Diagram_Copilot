/**
 * DecisionExtractor — deterministic extraction of design decisions.
 *
 * Detects decision language ("we decided/chose/selected/adopted", "Decision:"),
 * ADR sections, and status markers ("Status: Accepted"). Captures the decision as a
 * `decision` entity with the full text as description and any status/rationale as
 * attributes.
 */

import type { StructuredDocument } from '../documents/StructuredDocument';
import type { ExtractedEntity, Extractor, ExtractionResult } from './types';
import { makeEvidence, textNodes, underHeading } from './types';
import { shortLabel } from '../util';

const DECISION_RE = /\b(we (?:decided|chose|selected|opted|adopted|agreed|will use)|it was decided|decision:|the decision (?:is|was)|going with)\b/i;
const STATUS_RE = /\bstatus:\s*(accepted|proposed|rejected|superseded|deprecated|approved)\b/i;
const DECISION_HEADING_RE = /\bdecision/;
const RATIONALE_RE = /\b(because|since|due to|in order to|so that|rationale:)\b/i;

export const decisionExtractor: Extractor = {
  id: 'decision',
  extract(doc: StructuredDocument): ExtractionResult {
    const entities: ExtractedEntity[] = [];
    const isAdr = doc.docType === 'adr';

    for (const ctx of textNodes(doc)) {
      if (ctx.node.type === 'codeBlock' || ctx.node.type === 'section') continue;
      const explicit = DECISION_RE.test(ctx.text);
      const inDecisionSection = (isAdr || underHeading(ctx, DECISION_HEADING_RE)) && (ctx.node.type === 'paragraph' || ctx.node.type === 'listItem');
      const status = STATUS_RE.exec(ctx.text);

      if (!explicit && !inDecisionSection && !status) continue;
      if (status && !explicit && !inDecisionSection) continue; // a bare status line alone isn't a decision

      const attributes: Record<string, string | number | boolean> = {};
      if (status) attributes.status = status[1]!.toLowerCase();
      if (RATIONALE_RE.test(ctx.text)) attributes.hasRationale = true;

      entities.push({
        name: shortLabel(ctx.text),
        kind: 'decision',
        category: ctx.category,
        confidence: explicit ? 0.75 : 0.6,
        description: ctx.text,
        evidence: makeEvidence(doc, ctx),
        ...(Object.keys(attributes).length ? { attributes } : {}),
      });
    }

    return { entities, relations: [] };
  },
};
