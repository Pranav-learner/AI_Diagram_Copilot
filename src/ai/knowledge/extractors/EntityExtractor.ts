/**
 * EntityExtractor — deterministic extraction of named things (concepts, systems,
 * services, APIs, databases, actors, components, processes).
 *
 * Signals, strongest-first: explicit definitions ("X is a service…"), bold/code
 * spans, section headings, table first-columns, and Title-Case / CamelCase noun
 * phrases. Each occurrence carries evidence and a confidence; the PKM merges
 * repeated names across the document and other documents into single entities.
 */

import type { StructuredDocument } from '../documents/StructuredDocument';
import { isSection } from '../documents/StructuredDocument';
import type { ExtractedEntity, Extractor, ExtractionResult } from './types';
import { candidateNames, classifyEntityKind, isStopName, makeEvidence, textNodes } from './types';
import { classifyCategory } from '../documents/DocumentClassifier';
import { normalizeWhitespace } from '../util';

const DEFINITION_RE = /^([A-Z][\w .+/-]{2,48}?)\s+(?:is|are|acts as|provides|represents)\s+(?:an?|the)\s+([\w-]+)/;
const MAX_CANDIDATES_PER_NODE = 6;

export const entityExtractor: Extractor = {
  id: 'entity',
  extract(doc: StructuredDocument): ExtractionResult {
    const entities: ExtractedEntity[] = [];

    // Section headings that name things.
    for (const node of doc.nodes.values()) {
      if (!isSection(node) || isStopName(node.heading)) continue;
      entities.push({
        name: node.heading,
        kind: classifyEntityKind(node.heading),
        category: classifyCategory(node.heading),
        confidence: 0.55,
        evidence: { documentId: doc.id, nodeId: node.id, sectionId: node.id, excerpt: node.heading, ...(node.position.line ? { line: node.position.line } : {}) },
      });
    }

    for (const ctx of textNodes(doc)) {
      if (ctx.node.type === 'codeBlock' || ctx.node.type === 'image') continue;
      const seen = new Set<string>();
      const push = (name: string, confidence: number, description?: string) => {
        const norm = name.toLowerCase();
        if (isStopName(name) || seen.has(norm)) return;
        seen.add(norm);
        entities.push({ name, kind: classifyEntityKind(name), category: ctx.category, confidence, evidence: makeEvidence(doc, ctx), ...(description ? { description } : {}) });
      };

      // Definitions carry a description and rank highest.
      const def = DEFINITION_RE.exec(ctx.text);
      if (def) push(normalizeWhitespace(def[1]!), 0.75, ctx.text.length > 200 ? `${ctx.text.slice(0, 197)}…` : ctx.text);

      // Emphasised / code spans are strong entity signals.
      if ('spans' in ctx.node) {
        for (const span of ctx.node.spans) {
          if ((span.kind === 'strong' || span.kind === 'code') && span.text.length >= 3 && span.text.length <= 40) push(normalizeWhitespace(span.text), 0.6);
        }
      }

      // General Title-Case / CamelCase candidates (capped to limit noise).
      for (const name of candidateNames(ctx.text).slice(0, MAX_CANDIDATES_PER_NODE)) push(name, 0.5);
    }

    // Table first-column values are usually entity names.
    for (const node of doc.nodes.values()) {
      if (node.type !== 'table' || node.rows.length === 0) continue;
      for (const row of node.rows) {
        const name = row[0];
        if (name && !isStopName(name)) {
          entities.push({ name, kind: classifyEntityKind(name), category: classifyCategory(node.headers.join(' ')), confidence: 0.5, evidence: { documentId: doc.id, nodeId: node.id, excerpt: row.join(' · ').slice(0, 180) } });
        }
      }
    }

    return { entities, relations: [] };
  },
};
