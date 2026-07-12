/**
 * Deterministic id → integer hashing.
 *
 * Excalidraw needs `seed` and `versionNonce` integers on every element. Using a
 * stable hash of the DSL id (instead of randomness) makes `render(doc)` a pure
 * function: the same document always yields byte-identical elements, which is
 * what makes snapshot tests and idempotent sync possible.
 */

/** 32-bit FNV-1a hash of a string → unsigned int. */
export function hashId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A stable, positive 31-bit seed derived from an id. */
export function seedFrom(id: string): number {
  return hashId(id) % 0x7fffffff;
}

/** A stable nonce derived from an id (+ optional salt for derived elements). */
export function nonceFrom(id: string, salt = 0): number {
  return hashId(salt === 0 ? id : `${id}#${salt}`) % 0x7fffffff;
}
