/**
 * Small pure utilities for the Reverse Engineering Engine. Dependency-free.
 */

/** FNV-1a 32-bit hex — a deterministic content fingerprint for cache keys. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** URL/id-safe slug. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Normalise a repo path: forward slashes, no leading `./`. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** The directory portion of a path. */
export function dirname(path: string): string {
  const p = normalizePath(path);
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

/** The filename (last segment) of a path. */
export function basename(path: string): string {
  const p = normalizePath(path);
  return p.slice(p.lastIndexOf('/') + 1);
}

/** The extension (without dot), lowercased. */
export function extname(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase();
}

/**
 * Resolve a relative import against a from-file directory.
 * `resolveRelative('a/b/c.ts', './x')` → `a/b/x`.
 */
export function resolveRelative(fromFile: string, importPath: string): string {
  const base = dirname(fromFile).split('/').filter(Boolean);
  const parts = importPath.split('/');
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    else if (part === '..') base.pop();
    else base.push(part);
  }
  return base.join('/').replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|java)$/i, '');
}
