/**
 * The extractor toolkit — the deterministic knowledge-extraction contract + shared
 * heuristics.
 *
 * An {@link Extractor} reads a {@link StructuredDocument} and emits raw
 * {@link ExtractedEntity}/{@link ExtractedRelation}s (by name); the PKM resolves,
 * merges, and dedups them. Extraction is **deterministic** — regex/heuristics over
 * the structured model, never the LLM — per the spec's "do not rely solely on the
 * LLM". An LLM enrichment pass can be layered on top later without changing this
 * contract.
 */

import type { DocNode, StructuredDocument } from '../documents/StructuredDocument';
import { nodeText, sectionOf } from '../documents/StructuredDocument';
import type { KnowledgeCategory } from '../documents/DocumentClassifier';
import { classifyCategory } from '../documents/DocumentClassifier';
import type { EntityKind, EvidenceRef } from '../pkm/KnowledgeEntity';
import type { RelationKind } from '../pkm/KnowledgeRelation';
import { normalizeWhitespace } from '../util';

export interface ExtractedEntity {
  readonly name: string;
  readonly kind: EntityKind;
  readonly category?: KnowledgeCategory;
  readonly confidence: number;
  readonly aliases?: readonly string[];
  readonly tags?: readonly string[];
  readonly description?: string;
  readonly evidence: EvidenceRef;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface ExtractedRelation {
  readonly sourceName: string;
  readonly sourceKind?: EntityKind;
  readonly targetName: string;
  readonly targetKind?: EntityKind;
  readonly kind: RelationKind;
  readonly confidence: number;
  readonly evidence: EvidenceRef;
  readonly sentence: string;
}

export interface ExtractionResult {
  readonly entities: readonly ExtractedEntity[];
  readonly relations: readonly ExtractedRelation[];
}

export interface Extractor {
  readonly id: string;
  extract(doc: StructuredDocument): ExtractionResult;
}

export const EMPTY_RESULT: ExtractionResult = { entities: [], relations: [] };

// ── Node iteration + evidence ──────────────────────────────────────────────────

export interface NodeContext {
  readonly node: DocNode;
  readonly text: string;
  readonly sectionId?: string;
  /** The enclosing section heading + its ancestor headings (lowercased). */
  readonly headings: readonly string[];
  readonly category: KnowledgeCategory;
}

/** Iterate text-bearing nodes with their section context. */
export function textNodes(doc: StructuredDocument): NodeContext[] {
  const out: NodeContext[] = [];
  for (const node of doc.nodes.values()) {
    const text = normalizeWhitespace(nodeText(node));
    if (!text) continue;
    const section = sectionOf(doc, node.id);
    const headings = section ? [section.heading, ...section.path].map((h) => h.toLowerCase()) : [];
    out.push({ node, text, ...(section ? { sectionId: section.id } : {}), headings, category: classifyCategory(text) });
  }
  return out;
}

export function makeEvidence(doc: StructuredDocument, ctx: NodeContext): EvidenceRef {
  return {
    documentId: doc.id,
    nodeId: ctx.node.id,
    ...(ctx.sectionId ? { sectionId: ctx.sectionId } : {}),
    excerpt: ctx.text.length > 180 ? `${ctx.text.slice(0, 177)}…` : ctx.text,
    ...(ctx.node.position.line ? { line: ctx.node.position.line } : {}),
  };
}

/** True when any of the node's enclosing headings matches `re`. */
export function underHeading(ctx: NodeContext, re: RegExp): boolean {
  return ctx.headings.some((h) => re.test(h));
}

// ── Entity heuristics ──────────────────────────────────────────────────────────

const KIND_KEYWORDS: ReadonlyArray<{ re: RegExp; kind: EntityKind }> = [
  { re: /\b(gateway|load ?balancer|proxy|cdn)\b/i, kind: 'component' },
  { re: /\b(database|db|postgres\w*|mysql|mongo\w*|redis|cassandra|dynamo\w*|datastore)\b/i, kind: 'database' },
  { re: /\b(api|endpoint|rest|graphql|grpc)\b/i, kind: 'api' },
  { re: /\b(service|microservice|worker|daemon|server)\b/i, kind: 'service' },
  { re: /\b(queue|topic|broker|kafka|rabbitmq|sqs|pubsub|cache)\b/i, kind: 'component' },
  { re: /\b(user|customer|admin\w*|operator|actor|role|team|client|stakeholder|manager)\b/i, kind: 'actor' },
  { re: /\b(process|workflow|pipeline|job|task|procedure)\b/i, kind: 'process' },
  { re: /\b(module|component|library|package|subsystem|system|platform|engine)\b/i, kind: 'component' },
];

/** Guess an entity kind from its name; defaults to `concept`. */
export function classifyEntityKind(name: string): EntityKind {
  for (const { re, kind } of KIND_KEYWORDS) if (re.test(name)) return kind;
  return 'concept';
}

/** Common heading words that are not entities on their own. */
const STOP_NAMES = new Set([
  'overview',
  'introduction',
  'summary',
  'background',
  'contents',
  'table of contents',
  'goals',
  'scope',
  'requirements',
  'architecture',
  'design',
  'notes',
  'references',
  'appendix',
  'conclusion',
  'usage',
  'installation',
  'getting started',
  'examples',
  'details',
  'description',
  'the system',
  'the user',
  'this document',
]);

export function isStopName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.length < 3 || n.length > 60 || STOP_NAMES.has(n) || /^\d+$/.test(n);
}

/** Extract capitalised / CamelCase noun-phrase candidates from plain text. */
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;

export function candidateNames(text: string): string[] {
  const names = new Set<string>();
  const add = (raw: string) => {
    const name = normalizeWhitespace(raw).replace(LEADING_ARTICLE, '');
    if (name && !isStopName(name)) names.add(name);
  };
  // Title Case phrases: 1–4 capitalised words (allowing internal caps like "APIs").
  for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9]+(?:\s+(?:of|the|and|for)?\s*[A-Z][A-Za-z0-9]+){0,3})\b/g)) add(m[1]!);
  // CamelCase / dotted identifiers (e.g. AuthService, user.service).
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+|[a-z]+(?:\.[a-z]+)+)\b/g)) add(m[1]!);
  return [...names];
}
