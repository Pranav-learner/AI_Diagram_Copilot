import { describe, it, expect } from 'vitest';
import { DocumentIntelligenceEngine } from '../DocumentIntelligenceEngine';
import { parseDocument } from '../documents/DocumentParser';

function bigDocument(sections: number): string {
  const parts = ['# Large System\n'];
  for (let i = 0; i < sections; i++) {
    parts.push(`## Section ${i}\n`);
    parts.push(`The Service ${i} depends on the Database ${i % 10}. The system shall handle case ${i}.\n`);
    parts.push(`- Item ${i} A\n- Item ${i} B\n`);
  }
  return parts.join('\n');
}

describe('large documents', () => {
  it('parses a 300-section document quickly', () => {
    const content = bigDocument(300);
    const t0 = performance.now();
    const doc = parseDocument({ name: 'large.md', content });
    const ms = performance.now() - t0;
    expect(doc.counts.sections).toBe(301);
    expect(ms).toBeLessThan(1000);
  });

  it('ingests and searches a large document', () => {
    const engine = new DocumentIntelligenceEngine();
    const t0 = performance.now();
    const result = engine.ingest({ name: 'large.md', content: bigDocument(200) });
    const ms = performance.now() - t0;

    expect(result.added.entities).toBeGreaterThan(0);
    expect(engine.getPKM().byKind('requirement').length).toBeGreaterThan(50);
    expect(engine.search({ text: 'Database 3' }).length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(3000);
  });
});
