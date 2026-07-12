/**
 * Structural equality.
 *
 * Two documents are equal iff their canonical (stable) serializations match.
 * This treats field order and `undefined`-vs-absent as insignificant, which is
 * exactly the equality diagrams care about.
 */

import { stableStringify } from './serialize';

/** Deep structural equality for any two JSON-serializable values. */
export function equals(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
