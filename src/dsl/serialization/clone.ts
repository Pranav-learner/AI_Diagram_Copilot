/**
 * Deep cloning.
 *
 * Since documents are plain JSON data, a structural clone is a true deep copy
 * with no shared references — mutating a clone can never affect the original.
 * Uses the platform `structuredClone` when available, falling back to a JSON
 * round-trip (documents contain only JSON-serializable values by construction).
 */

/** Deep, independent copy of any JSON-serializable value. */
export function deepClone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <V>(v: V) => V }).structuredClone;
  if (typeof sc === 'function') return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
