import { describe, it, expect } from 'vitest';
import { parseDocument } from '../documents/DocumentParser';
import { classifyDocument } from '../documents/DocumentClassifier';
import { entityExtractor } from '../extractors/EntityExtractor';
import { relationshipExtractor } from '../extractors/RelationshipExtractor';
import { requirementExtractor } from '../extractors/RequirementExtractor';
import { decisionExtractor } from '../extractors/DecisionExtractor';
import { statementExtractor } from '../extractors/StatementExtractor';
import { ARCHITECTURE_DOC } from './helpers';

function doc() {
  const parsed = parseDocument({ name: 'architecture.md', content: ARCHITECTURE_DOC });
  return { ...parsed, docType: classifyDocument(parsed) };
}

describe('EntityExtractor', () => {
  it('extracts named systems, services, and databases', () => {
    const { entities } = entityExtractor.extract(doc());
    const names = entities.map((e) => e.name.toLowerCase());
    expect(names).toContain('api gateway');
    expect(names.some((n) => n.includes('orders service'))).toBe(true);
    expect(entities.find((e) => e.name.toLowerCase().includes('postgres') && e.kind === 'database')).toBeTruthy();
  });
});

describe('RelationshipExtractor', () => {
  it('extracts dependency and call relationships', () => {
    const { relations } = relationshipExtractor.extract(doc());
    expect(relations.some((r) => /orders service/i.test(r.sourceName) && r.kind === 'dependsOn')).toBe(true);
    expect(relations.some((r) => /api gateway/i.test(r.sourceName) && r.kind === 'calls')).toBe(true);
  });
});

describe('RequirementExtractor', () => {
  it('extracts requirements with MoSCoW priorities', () => {
    const { entities } = requirementExtractor.extract(doc());
    const reqs = entities.filter((e) => e.kind === 'requirement');
    expect(reqs.length).toBeGreaterThanOrEqual(3);
    expect(reqs.some((r) => r.attributes?.priority === 'must')).toBe(true);
    expect(reqs.some((r) => r.attributes?.priority === 'should')).toBe(true);
  });
});

describe('DecisionExtractor', () => {
  it('extracts decisions with status', () => {
    const { entities } = decisionExtractor.extract(doc());
    const decisions = entities.filter((e) => e.kind === 'decision');
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions.some((d) => d.attributes?.status === 'accepted')).toBe(true);
  });
});

describe('StatementExtractor', () => {
  it('extracts risks, constraints, and assumptions from their sections', () => {
    const { entities } = statementExtractor.extract(doc());
    expect(entities.some((e) => e.kind === 'risk')).toBe(true);
    expect(entities.some((e) => e.kind === 'constraint')).toBe(true);
    expect(entities.some((e) => e.kind === 'assumption')).toBe(true);
  });
});
