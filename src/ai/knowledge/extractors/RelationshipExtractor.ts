/**
 * RelationshipExtractor — deterministic extraction of relationships/dependencies
 * between named entities.
 *
 * It scans each sentence for relation verbs ("depends on", "calls", "uses",
 * "contains", "produces", …) and arrow notation ("A → B"), taking the nearest
 * Title-Case / CamelCase name on each side. Emitted relations are by *name*; the
 * PKM resolves them to entity ids and merges corroborating mentions.
 */

import type { StructuredDocument } from '../documents/StructuredDocument';
import type { RelationKind } from '../pkm/KnowledgeRelation';
import type { ExtractedRelation, Extractor, ExtractionResult } from './types';
import { candidateNames, isStopName, makeEvidence, textNodes } from './types';
import { splitSentences } from '../util';

const VERB_PATTERNS: ReadonlyArray<{ re: RegExp; kind: RelationKind }> = [
  { re: /\bdepends?\s+on\b/i, kind: 'dependsOn' },
  { re: /\b(?:calls?|invokes?|requests?)\b/i, kind: 'calls' },
  { re: /\b(?:connects?\s+to|talks?\s+to|integrates?\s+with|communicates?\s+with)\b/i, kind: 'uses' },
  { re: /\b(?:reads?\s+from|consumes?|subscribes?\s+to)\b/i, kind: 'consumes' },
  { re: /\b(?:writes?\s+to|produces?|publishes?\s+to|sends?\s+.+?\bto)\b/i, kind: 'produces' },
  { re: /\b(?:contains?|includes?|consists?\s+of|comprises?)\b/i, kind: 'contains' },
  { re: /\bis\s+part\s+of\b/i, kind: 'partOf' },
  { re: /\bimplements?\b/i, kind: 'implements' },
  { re: /\btriggers?\b/i, kind: 'triggers' },
  { re: /\bowns?\b/i, kind: 'owns' },
  { re: /\b(?:uses?|leverages?|relies?\s+on)\b/i, kind: 'uses' },
];

const ARROW_RE = /\s*(?:-{1,2}>|→|➔|⟶)\s*/;

export const relationshipExtractor: Extractor = {
  id: 'relationship',
  extract(doc: StructuredDocument): ExtractionResult {
    const relations: ExtractedRelation[] = [];
    const seen = new Set<string>();
    const emit = (rel: ExtractedRelation) => {
      const key = `${rel.sourceName.toLowerCase()}|${rel.kind}|${rel.targetName.toLowerCase()}`;
      if (rel.sourceName.toLowerCase() === rel.targetName.toLowerCase() || seen.has(key)) return;
      seen.add(key);
      relations.push(rel);
    };

    for (const ctx of textNodes(doc)) {
      if (ctx.node.type === 'codeBlock') continue;
      for (const sentence of splitSentences(ctx.text)) {
        // Arrow chains: A → B → C
        if (ARROW_RE.test(sentence)) {
          const parts = sentence.split(ARROW_RE).map((p) => candidateNames(p).pop()).filter((n): n is string => !!n && !isStopName(n));
          for (let i = 0; i + 1 < parts.length; i++) {
            emit({ sourceName: parts[i]!, targetName: parts[i + 1]!, kind: 'relatedTo', confidence: 0.55, evidence: makeEvidence(doc, ctx), sentence });
          }
        }

        // Verb patterns: <name> <verb> <name>
        for (const { re, kind } of VERB_PATTERNS) {
          const m = re.exec(sentence);
          if (!m) continue;
          const before = sentence.slice(0, m.index);
          const after = sentence.slice(m.index + m[0].length);
          const source = candidateNames(before).pop();
          const target = candidateNames(after).find((n) => !isStopName(n));
          if (source && target && !isStopName(source)) {
            emit({ sourceName: source, targetName: target, kind, confidence: 0.6, evidence: makeEvidence(doc, ctx), sentence });
          }
          break; // one relation per sentence keeps precision high
        }
      }
    }

    return { entities: [], relations };
  },
};
