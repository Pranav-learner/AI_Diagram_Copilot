/**
 * RequirementExtractor — deterministic extraction of requirements + responsibilities.
 *
 * Requirements are detected from modal verbs (shall/must/should/will/may), explicit
 * ids (REQ-123, FR-1), and Requirements/Functional/Non-functional sections. The
 * modal maps to a MoSCoW-style priority. Responsibilities ("X is responsible for
 * Y") are captured as their own kind. Statements, not names — so the label is a
 * short summary and the full text is the description.
 */

import type { StructuredDocument } from '../documents/StructuredDocument';
import type { ExtractedEntity, Extractor, ExtractionResult } from './types';
import { makeEvidence, textNodes, underHeading } from './types';
import { shortLabel } from '../util';

const MODAL_RE = /\b(shall|must|should|will|may|required to|has to|needs? to)\b/i;
const REQ_ID_RE = /\b((?:REQ|FR|NFR|US|UC)[- ]?\d{1,4}(?:\.\d+)?)\b/i;
const REQ_HEADING_RE = /\b(requirements?|functional|non-?functional|acceptance criteria|user stor)/;
const RESP_RE = /\b(is|are)\s+responsible\s+for\b/i;
const RESP_HEADING_RE = /\bresponsibilit/;

function priorityOf(text: string): string {
  const m = MODAL_RE.exec(text);
  const word = m?.[1]?.toLowerCase() ?? '';
  if (/shall|must|required|has to|needs to/.test(word)) return 'must';
  if (word === 'should') return 'should';
  if (word === 'will') return 'must';
  return 'could';
}

export const requirementExtractor: Extractor = {
  id: 'requirement',
  extract(doc: StructuredDocument): ExtractionResult {
    const entities: ExtractedEntity[] = [];

    for (const ctx of textNodes(doc)) {
      if (ctx.node.type === 'codeBlock' || ctx.node.type === 'section') continue;
      const isReqNode = ctx.node.type === 'paragraph' || ctx.node.type === 'listItem';
      if (!isReqNode) continue;

      const idMatch = REQ_ID_RE.exec(ctx.text);
      const hasModal = MODAL_RE.test(ctx.text);
      const inReqSection = underHeading(ctx, REQ_HEADING_RE);

      // Responsibilities.
      if (RESP_RE.test(ctx.text) || (underHeading(ctx, RESP_HEADING_RE) && ctx.node.type === 'listItem')) {
        entities.push({ name: shortLabel(ctx.text), kind: 'responsibility', category: ctx.category, confidence: 0.65, description: ctx.text, evidence: makeEvidence(doc, ctx) });
        continue;
      }

      // Requirements: a modal, an id, or a list item inside a requirements section.
      if (hasModal || idMatch || (inReqSection && ctx.node.type === 'listItem')) {
        const name = idMatch ? idMatch[1]!.toUpperCase().replace(/\s/, '-') : shortLabel(ctx.text);
        const confidence = hasModal ? 0.8 : idMatch ? 0.75 : 0.6;
        entities.push({
          name,
          kind: 'requirement',
          category: ctx.category,
          confidence,
          description: ctx.text,
          tags: [priorityOf(ctx.text)],
          attributes: { priority: priorityOf(ctx.text), ...(idMatch ? { requirementId: idMatch[1]!.toUpperCase() } : {}) },
          evidence: makeEvidence(doc, ctx),
        });
      }
    }

    return { entities, relations: [] };
  },
};
