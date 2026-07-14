/**
 * Small pure utilities shared across the Document Intelligence Engine.
 *
 * Dependency-free by design: a stable content hash (for cache keys / change
 * detection), slugging, whitespace normalisation, tokenisation, and word counting.
 * Nothing here reads a clock or the network.
 */

/** FNV-1a 32-bit hash as an 8-char hex string. Deterministic content fingerprint. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** URL-safe slug: lowercase, non-alphanumerics → hyphens, trimmed. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Collapse runs of whitespace to single spaces and trim. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Normalise a name/term for identity comparison (case + whitespace folded). */
export function normalizeTerm(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

/** Lowercase word tokens (length ≥ 2), keeping internal `.+#` (node.js, c#, v1.2). */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) ?? [])
    .map((t) => t.replace(/[.+#]+$/, ''))
    .filter((t) => t.length >= 2);
}

export function wordCount(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

/** A short label from a longer statement: first `words` words, ≤ `maxChars`. */
export function shortLabel(text: string, words = 9, maxChars = 70): string {
  const clean = normalizeWhitespace(text).replace(/^[-*>\s]+/, '');
  const label = clean.split(' ').slice(0, words).join(' ').replace(/[.,;:]+$/, '');
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

/** Split text into sentences (best-effort, deterministic). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(0-9"'`*])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
