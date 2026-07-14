import { describe, it, expect } from 'vitest';
import { parseDocument } from '../documents/DocumentParser';
import { classifyDocument, classifyCategory } from '../documents/DocumentClassifier';
import { ARCHITECTURE_DOC, README_DOC, PRD_DOC } from './helpers';

describe('classifyDocument', () => {
  it('classifies architecture, README, and PRD documents', () => {
    expect(classifyDocument(parseDocument({ name: 'architecture.md', content: ARCHITECTURE_DOC }))).toBe('architecture');
    expect(classifyDocument(parseDocument({ name: 'README.md', content: README_DOC }))).toBe('readme');
    expect(classifyDocument(parseDocument({ name: 'notifications.md', content: PRD_DOC }))).toBe('prd');
  });

  it('recognises an ADR by its sections', () => {
    const adr = '# ADR 1: Use Postgres\n\n## Status\n\nAccepted\n\n## Context\n\nWe need durable storage.\n\n## Decision\n\nUse PostgreSQL.\n\n## Consequences\n\nOps overhead.';
    expect(classifyDocument(parseDocument({ name: 'adr-001.md', content: adr }))).toBe('adr');
  });
});

describe('classifyCategory', () => {
  it('classifies text into the taxonomy', () => {
    expect(classifyCategory('OAuth authentication with JWT and RBAC permissions')).toBe('security');
    expect(classifyCategory('The REST API endpoint returns a JSON response')).toBe('api');
    expect(classifyCategory('The Postgres database schema and migrations')).toBe('database');
    expect(classifyCategory('Deploy to Kubernetes using a Docker container')).toBe('infrastructure');
    expect(classifyCategory('hello world')).toBe('general');
  });
});
