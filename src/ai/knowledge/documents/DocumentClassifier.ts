/**
 * DocumentClassifier — deterministic document-type + category classification.
 *
 * Classifies a parsed document into a {@link DocumentType} (README, PRD, SRS, ADR,
 * API doc, meeting notes, SOP, architecture, …) from its filename, title, and
 * heading vocabulary, and classifies free text into a {@link KnowledgeCategory}
 * (technical, business, architecture, security, …). Both are keyword/score based —
 * no LLM — so classification is reproducible and cheap. The taxonomy is extensible.
 */

import type { DocumentType, StructuredDocument } from './StructuredDocument';

export type KnowledgeCategory =
  | 'technical'
  | 'business'
  | 'architecture'
  | 'infrastructure'
  | 'requirements'
  | 'api'
  | 'database'
  | 'workflow'
  | 'security'
  | 'testing'
  | 'general'
  | (string & {});

interface TypeRule {
  readonly type: DocumentType;
  /** Matches against filename/title. */
  readonly name?: RegExp;
  /** Heading keywords that count toward this type. */
  readonly headings?: readonly string[];
}

const TYPE_RULES: readonly TypeRule[] = [
  { type: 'adr', name: /\b(adr|architecture decision)\b/i, headings: ['status', 'context', 'decision', 'consequences'] },
  { type: 'prd', name: /\b(prd|product requirements?)\b/i, headings: ['user stories', 'goals', 'success metrics', 'scope', 'personas', 'out of scope'] },
  { type: 'srs', name: /\b(srs|software requirements specification)\b/i, headings: ['functional requirements', 'non-functional requirements', 'system requirements'] },
  { type: 'api-doc', name: /\b(api reference|api docs?|openapi|swagger)\b/i, headings: ['endpoints', 'api reference', 'authentication', 'request', 'response', 'parameters'] },
  { type: 'meeting-notes', name: /\b(meeting|minutes|standup|notes)\b/i, headings: ['attendees', 'agenda', 'action items', 'decisions', 'discussion'] },
  { type: 'sop', name: /\b(sop|standard operating procedure|runbook|procedure)\b/i, headings: ['procedure', 'steps', 'prerequisites', 'rollback', 'escalation'] },
  { type: 'architecture', name: /\b(architecture|system design)\b/i, headings: ['architecture', 'components', 'data flow', 'system design', 'deployment', 'services'] },
  { type: 'design', name: /\b(design doc|design document|proposal|rfc)\b/i, headings: ['motivation', 'proposal', 'alternatives', 'design', 'trade-offs'] },
  { type: 'requirements', name: /\brequirements?\b/i, headings: ['requirements', 'constraints', 'acceptance criteria'] },
  { type: 'readme', name: /\breadme\b/i, headings: ['installation', 'usage', 'getting started', 'quick start', 'contributing'] },
];

/** Classify a parsed document into a {@link DocumentType}. */
export function classifyDocument(doc: StructuredDocument): DocumentType {
  const name = `${doc.source.name} ${doc.title}`.toLowerCase();
  const headings = doc.outline.map((o) => o.heading.toLowerCase());
  const headingText = headings.join(' | ');

  let best: { type: DocumentType; score: number } | undefined;
  for (const rule of TYPE_RULES) {
    let score = 0;
    if (rule.name?.test(name)) score += 3;
    for (const kw of rule.headings ?? []) if (headingText.includes(kw)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { type: rule.type, score };
  }
  if (best && best.score >= 2) return best.type;
  // Weak signal → fall back to the raw format, or 'wiki' for a titled knowledge page.
  if (doc.sectionIds.length >= 3) return 'wiki';
  return doc.source.format;
}

const CATEGORY_KEYWORDS: Readonly<Record<KnowledgeCategory, readonly RegExp[]>> = {
  security: [/\b(auth\w*|oauth|jwt|encrypt\w*|permission|rbac|vulnerab\w*|threat|firewall|tls|ssl|credential|secret|compliance)\b/i],
  api: [/\b(api|endpoint|rest|graphql|grpc|request|response|http|webhook|payload|openapi)\b/i],
  database: [/\b(database|db|sql|postgres|mysql|mongo\w*|schema|table|index|query|migration|nosql|redis)\b/i],
  infrastructure: [/\b(infrastructure|deploy\w*|kubernetes|k8s|docker|container|cloud|aws|gcp|azure|terraform|ci\/cd|pipeline|server)\b/i],
  testing: [/\b(test\w*|qa|coverage|unit|integration|e2e|assert\w*|mock|fixture)\b/i],
  architecture: [/\b(architect\w*|component|module|service|microservice|topology|data flow|layer|boundary)\b/i],
  workflow: [/\b(workflow|process|step|approval|pipeline|state machine|flow|procedure|orchestrat\w*)\b/i],
  requirements: [/\b(requirement|shall|must|should|acceptance criteria|user story|constraint|scope)\b/i],
  business: [/\b(business|revenue|cost|customer|stakeholder|market|kpi|roi|value|goal|objective)\b/i],
  technical: [/\b(algorithm|implement\w*|function|class|interface|library|framework|code|runtime|performance)\b/i],
  general: [],
};

/** Classify free text into the most likely {@link KnowledgeCategory}. */
export function classifyCategory(text: string): KnowledgeCategory {
  let best: { category: KnowledgeCategory; score: number } | undefined;
  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'general') continue;
    let score = 0;
    for (const re of patterns) {
      const matches = text.match(new RegExp(re, 'gi'));
      if (matches) score += matches.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  return best?.category ?? 'general';
}

/** All categories in the taxonomy (for indexing / UI). */
export const KNOWLEDGE_CATEGORIES = Object.keys(CATEGORY_KEYWORDS) as KnowledgeCategory[];
