/**
 * Pure normalization utilities for fusion. Dependency-free.
 */

/** URL/id-safe slug. */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

/**
 * A canonical key for entity resolution: folds camelCase / kebab / snake / dotted
 * surface forms and strips version suffixes, so "UserService", "user-service", and
 * "User Service v2" all collapse to `user service`.
 */
export function canonicalKey(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_./\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    // Strip a trailing version token (before splitting letter/digit boundaries, so
    // "v2" is still recognised as a version rather than folded to "v 2").
    .replace(/\s+v\d+(\.\d+)*$/i, '')
    // Fold letter↔digit boundaries so "Service0" and "Service 0" collapse together.
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Extract a version token from a name/attributes, if present. */
export function extractVersion(name: string, attributes: Readonly<Record<string, string | number | boolean>>): string | undefined {
  const fromAttr = attributes.version ?? attributes.apiVersion;
  if (fromAttr !== undefined) return String(fromAttr);
  const m = /[\s_-](v\d+(?:\.\d+)*)$/i.exec(name);
  return m ? m[1]! : undefined;
}

/** Significant lowercase word tokens (length ≥ 2). */
export function tokens(text: string): string[] {
  return canonicalKey(text).split(' ').filter((t) => t.length >= 2);
}
