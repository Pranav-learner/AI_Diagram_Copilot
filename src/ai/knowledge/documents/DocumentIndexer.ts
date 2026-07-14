/**
 * DocumentIndexer — an incremental full-text index over a document collection.
 *
 * Maps tokens to postings (document + node + term frequency) so keyword search
 * across many large documents is a hash lookup, not a scan. It is maintained
 * **incrementally**: `add`/`remove` a single document without touching the rest,
 * and a per-document token record makes removal O(tokens-in-doc). Also keeps a
 * heading index for section-level search.
 */

import type { StructuredDocument } from './StructuredDocument';
import { nodeText } from './StructuredDocument';
import { tokenize } from '../util';

export interface Posting {
  readonly documentId: string;
  readonly nodeId: string;
  readonly frequency: number;
}

export interface HeadingEntry {
  readonly documentId: string;
  readonly sectionId: string;
  readonly heading: string;
}

export class DocumentIndexer {
  /** token → (documentId → (nodeId → frequency)). */
  private readonly index = new Map<string, Map<string, Map<string, number>>>();
  /** documentId → tokens it contributed (for O(tokens) removal). */
  private readonly docTokens = new Map<string, Set<string>>();
  private readonly headings = new Map<string, HeadingEntry[]>();

  add(doc: StructuredDocument): void {
    if (this.docTokens.has(doc.id)) this.remove(doc.id);
    const tokens = new Set<string>();
    const headingEntries: HeadingEntry[] = [];

    for (const node of doc.nodes.values()) {
      if (node.type === 'section') headingEntries.push({ documentId: doc.id, sectionId: node.id, heading: node.heading });
      const text = nodeText(node);
      if (!text) continue;
      const counts = new Map<string, number>();
      for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [token, freq] of counts) {
        tokens.add(token);
        let byDoc = this.index.get(token);
        if (!byDoc) this.index.set(token, (byDoc = new Map()));
        let byNode = byDoc.get(doc.id);
        if (!byNode) byDoc.set(doc.id, (byNode = new Map()));
        byNode.set(node.id, freq);
      }
    }
    this.docTokens.set(doc.id, tokens);
    this.headings.set(doc.id, headingEntries);
  }

  remove(documentId: string): void {
    const tokens = this.docTokens.get(documentId);
    if (!tokens) return;
    for (const token of tokens) {
      const byDoc = this.index.get(token);
      if (byDoc) {
        byDoc.delete(documentId);
        if (byDoc.size === 0) this.index.delete(token);
      }
    }
    this.docTokens.delete(documentId);
    this.headings.delete(documentId);
  }

  /** Postings for a single token. */
  postings(token: string): Posting[] {
    const byDoc = this.index.get(token.toLowerCase());
    if (!byDoc) return [];
    const out: Posting[] = [];
    for (const [documentId, byNode] of byDoc) for (const [nodeId, frequency] of byNode) out.push({ documentId, nodeId, frequency });
    return out;
  }

  /** Documents containing all query tokens, ranked by total term frequency. */
  searchDocuments(query: string): Array<{ documentId: string; score: number }> {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    const scores = new Map<string, number>();
    const docSets: Set<string>[] = [];
    for (const token of tokens) {
      const byDoc = this.index.get(token);
      const set = new Set<string>();
      if (byDoc) {
        for (const [documentId, byNode] of byDoc) {
          set.add(documentId);
          let freq = 0;
          for (const f of byNode.values()) freq += f;
          scores.set(documentId, (scores.get(documentId) ?? 0) + freq);
        }
      }
      docSets.push(set);
    }
    // AND semantics: document must contain every token.
    const intersection = docSets.reduce((acc, s) => new Set([...acc].filter((d) => s.has(d))));
    return [...intersection].map((documentId) => ({ documentId, score: scores.get(documentId) ?? 0 })).sort((a, b) => b.score - a.score);
  }

  headingsOf(documentId: string): readonly HeadingEntry[] {
    return this.headings.get(documentId) ?? [];
  }

  get documentCount(): number {
    return this.docTokens.size;
  }

  clear(): void {
    this.index.clear();
    this.docTokens.clear();
    this.headings.clear();
  }
}
