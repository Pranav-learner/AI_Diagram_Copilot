import { describe, it, expect } from 'vitest';
import {
  normalizeRelativePath,
  checkIngestibility,
  DEFAULT_INGESTION_CONFIG,
} from '../lib/repositoryIngestion';

describe('repositoryIngestion', () => {
  it('normalizes paths and removes root directory wrapper when requested', () => {
    expect(normalizeRelativePath('my-repo/src/controllers/user.controller.ts', true)).toBe(
      'src/controllers/user.controller.ts'
    );
    expect(normalizeRelativePath('money-audit\\src\\main\\java\\App.java', true)).toBe(
      'src/main/java/App.java'
    );
    expect(normalizeRelativePath('src/main/java/App.java')).toBe(
      'src/main/java/App.java'
    );
  });

  it('rejects path traversal elements', () => {
    expect(normalizeRelativePath('../../../etc/passwd')).toBe('etc/passwd');
    expect(normalizeRelativePath('repo/../secret.txt')).toBe('secret.txt');
  });

  it('filters ignored directories like .git and node_modules', () => {
    const gitCheck = checkIngestibility('repo/.git/config', 100);
    expect(gitCheck.accept).toBe(false);
    expect(gitCheck.reason).toContain('Ignored directory');

    const nodeModulesCheck = checkIngestibility('repo/node_modules/react/index.js', 100);
    expect(nodeModulesCheck.accept).toBe(false);
    expect(nodeModulesCheck.reason).toContain('Ignored directory');

    const venvCheck = checkIngestibility('repo/.venv/lib/site.py', 100);
    expect(venvCheck.accept).toBe(false);
  });

  it('filters binary file formats', () => {
    const imageCheck = checkIngestibility('repo/assets/logo.png', 500);
    expect(imageCheck.accept).toBe(false);
    expect(imageCheck.reason).toContain('Binary file format');

    const jarCheck = checkIngestibility('repo/build/app.jar', 5000);
    expect(jarCheck.accept).toBe(false);
  });

  it('filters 0-byte empty files', () => {
    const emptyCheck = checkIngestibility('repo/src/empty.ts', 0);
    expect(emptyCheck.accept).toBe(false);
    expect(emptyCheck.reason).toContain('Empty file');
  });

  it('filters files exceeding maximum file size', () => {
    const largeCheck = checkIngestibility('repo/src/huge.json', 2 * 1024 * 1024);
    expect(largeCheck.accept).toBe(false);
    expect(largeCheck.reason).toContain('exceeds 1MB');
  });

  it('accepts valid source code files', () => {
    const tsCheck = checkIngestibility('repo/src/index.ts', 1024);
    expect(tsCheck.accept).toBe(true);
    expect(tsCheck.normalizedPath).toBe('src/index.ts');

    const javaCheck = checkIngestibility('repo/src/main/java/App.java', 2048);
    expect(javaCheck.accept).toBe(true);
    expect(javaCheck.normalizedPath).toBe('src/main/java/App.java');

    const pyCheck = checkIngestibility('repo/app/main.py', 512);
    expect(pyCheck.accept).toBe(true);
    expect(pyCheck.normalizedPath).toBe('app/main.py');
  });
});
