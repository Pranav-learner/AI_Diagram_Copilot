import { describe, it, expect } from 'vitest';
import { parseDocument } from '../documents/DocumentParser';
import { isSection } from '../documents/StructuredDocument';
import { ARCHITECTURE_DOC, README_DOC } from './helpers';

describe('DocumentParser', () => {
  it('parses frontmatter, headings, and hierarchy', () => {
    const doc = parseDocument({ name: 'architecture.md', content: ARCHITECTURE_DOC });
    expect(doc.title).toBe('Payments Architecture');
    expect(doc.metadata.tags).toEqual(['payments', 'backend']);
    expect(doc.outline.map((o) => o.heading)).toEqual(expect.arrayContaining(['Overview', 'Components', 'Requirements', 'Decisions']));

    // Sections nest under the H1.
    const h1 = [...doc.nodes.values()].find((n) => isSection(n) && n.level === 1)!;
    expect(isSection(h1) && h1.childIds.length).toBeGreaterThan(0);
    const components = doc.outline.find((o) => o.heading === 'Components')!;
    const comp = doc.nodes.get(components.sectionId)!;
    expect(comp.type).toBe('section');
  });

  it('extracts lists, tables, code blocks, and inline spans', () => {
    const doc = parseDocument({ name: 'architecture.md', content: ARCHITECTURE_DOC });
    expect(doc.counts.lists).toBeGreaterThan(0);
    expect(doc.counts.tables).toBe(1);

    const table = [...doc.nodes.values()].find((n) => n.type === 'table');
    expect(table?.type === 'table' && table.headers).toEqual(['Component', 'Purpose']);
    expect(table?.type === 'table' && table.rows.length).toBe(2);

    // Bold span captured.
    const bold = [...doc.nodes.values()].some((n) => 'spans' in n && n.spans.some((s) => s.kind === 'strong' && s.text === 'API Gateway'));
    expect(bold).toBe(true);
  });

  it('captures code blocks and links in a README', () => {
    const doc = parseDocument({ name: 'README.md', content: README_DOC });
    expect(doc.counts.codeBlocks).toBe(1);
    const code = [...doc.nodes.values()].find((n) => n.type === 'codeBlock');
    expect(code?.type === 'codeBlock' && code.language).toBe('bash');
    expect(doc.references.some((r) => r.kind === 'link' && r.target === 'https://acme.dev/docs')).toBe(true);
  });

  it('parses task lists and nested lists', () => {
    const doc = parseDocument({ name: 't.md', content: '# T\n\n- [ ] todo one\n- [x] done two\n  - nested item\n' });
    const items = [...doc.nodes.values()].filter((n) => n.type === 'listItem');
    expect(items.some((i) => i.type === 'listItem' && i.checked === false)).toBe(true);
    expect(items.some((i) => i.type === 'listItem' && i.checked === true)).toBe(true);
    // The nested item exists.
    expect(items.some((i) => i.type === 'listItem' && i.text === 'nested item')).toBe(true);
  });

  it('is deterministic and content-hashed', () => {
    const a = parseDocument({ name: 'x.md', content: ARCHITECTURE_DOC });
    const b = parseDocument({ name: 'x.md', content: ARCHITECTURE_DOC });
    expect(a.source.contentHash).toBe(b.source.contentHash);
    expect(a.nodes.size).toBe(b.nodes.size);
  });
});
