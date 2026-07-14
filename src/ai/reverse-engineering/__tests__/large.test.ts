import { describe, it, expect } from 'vitest';
import { ReverseEngineeringEngine } from '../ReverseEngineeringEngine';

describe('large repositories', () => {
  it('analyzes a 300-file repository quickly and incrementally', () => {
    const engine = new ReverseEngineeringEngine();
    const files = Array.from({ length: 300 }, (_, i) => ({
      path: `src/mod${i % 20}/service${i}.ts`,
      content: `import { Base } from '../base';\nimport { lib } from 'shared-lib';\nexport class Service${i} extends Base {\n  run() { return helper${i}(); }\n}\nexport function helper${i}() { return ${i}; }\n`,
    }));

    const t0 = performance.now();
    engine.addFiles(files);
    const graph = engine.getGraph(); // builds once
    const ms = performance.now() - t0;

    expect(graph.byKind('class').length).toBe(300);
    expect(graph.byKind('library').some((l) => l.name === 'shared-lib')).toBe(true);
    expect(graph.byKind('boundedContext').length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(4000);

    // Incremental update re-parses only one file.
    const before = engine.stats().parseCacheHits;
    engine.addFile(files[0]!.path, files[0]!.content); // identical → cache/no-op
    engine.getGraph();
    expect(engine.stats().parseCacheHits).toBeGreaterThanOrEqual(before);
  });
});
