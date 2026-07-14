/**
 * Linking — connect related concepts beyond exact-name merging.
 *
 * The PKM already merges entities by normalised name (repeated entities, aliases,
 * cross-document duplicates). This adds the fuzzier links the spec asks for:
 * detecting likely-duplicate concepts (token overlap) and acronym/expansion pairs
 * ("DB" ↔ "Database", "API Gateway" ↔ "APIGW"). It returns *suggestions* rather
 * than auto-merging, so no false merge silently corrupts the graph.
 */

import type { KnowledgeEntity } from './KnowledgeEntity';
import { STATEMENT_KINDS } from './KnowledgeEntity';
import type { ProjectKnowledgeModel } from './ProjectKnowledgeModel';
import { tokenize } from '../util';

export interface DuplicateSuggestion {
  readonly a: string;
  readonly b: string;
  readonly similarity: number;
  readonly reason: 'token-overlap' | 'acronym';
}

/** Uppercase-initials acronym of a multi-word name, e.g. "API Gateway" → "AG". */
function acronym(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 2 ? words.map((w) => w[0]!).join('').toUpperCase() : '';
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Detect likely-duplicate entities (same family) that the exact-name merge missed.
 * Only compares named entities (statements are kind-scoped and short).
 */
export function suggestDuplicates(pkm: ProjectKnowledgeModel, minSimilarity = 0.6): DuplicateSuggestion[] {
  const named = pkm.entities().filter((e) => !STATEMENT_KINDS.has(e.kind));
  const tokens = new Map<string, Set<string>>();
  const acr = new Map<string, string>();
  for (const e of named) {
    tokens.set(e.id, new Set(tokenize(e.name)));
    acr.set(e.id, acronym(e.name));
  }

  const out: DuplicateSuggestion[] = [];
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i]!;
      const b = named[j]!;
      // Acronym match (either direction).
      if ((acr.get(a.id) && acr.get(a.id) === b.name.toUpperCase().replace(/\s/g, '')) || (acr.get(b.id) && acr.get(b.id) === a.name.toUpperCase().replace(/\s/g, ''))) {
        out.push({ a: a.id, b: b.id, similarity: 1, reason: 'acronym' });
        continue;
      }
      const sim = jaccard(tokens.get(a.id)!, tokens.get(b.id)!);
      if (sim >= minSimilarity && sim < 1) out.push({ a: a.id, b: b.id, similarity: Number(sim.toFixed(2)), reason: 'token-overlap' });
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

/** Entities that co-occur in ≥ `minDocs` documents (repeated across sources). */
export function repeatedEntities(pkm: ProjectKnowledgeModel, minDocs = 2): KnowledgeEntity[] {
  return pkm.entities().filter((e) => e.documentIds.length >= minDocs).sort((a, b) => b.documentIds.length - a.documentIds.length);
}
