/**
 * Scalar value types and the injectable {@link Clock}.
 *
 * Like {@link IdFactory}, the DSL never calls `Date.now()` implicitly — every
 * timestamp flows through a `Clock`, so entity creation is deterministic in
 * tests ({@link fixedClock}) and the domain model has no hidden dependency on
 * wall-clock time.
 */

/** An ISO-8601 timestamp string, e.g. `2026-07-12T10:00:00.000Z`. */
export type Timestamp = string;

/** A CSS-compatible color string (`#rrggbb`, `rgba(...)`, named, …). */
export type Color = string;

/** Opacity in the closed range `[0, 1]`. */
export type Opacity = number;

/** A semantic version string, e.g. `1.0.0`. */
export type SemanticVersion = string;

/** Supplies the current time. Injected so entity timestamps are testable. */
export interface Clock {
  now(): Timestamp;
}

/** The real clock — wall time as an ISO string. */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

/** A clock frozen at `ts`. Use in tests for stable, comparable output. */
export function fixedClock(ts: Timestamp): Clock {
  return { now: () => ts };
}

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse `major.minor.patch`. Throws on anything else (pre-release tags etc). */
export function parseSemVer(version: SemanticVersion): ParsedSemVer {
  const m = SEMVER_RE.exec(version);
  if (!m) throw new Error(`Invalid semantic version: "${version}"`);
  // Capture groups 1..3 are guaranteed present by the regex match.
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** `-1 | 0 | 1` ordering of two semantic versions. */
export function compareSemVer(a: SemanticVersion, b: SemanticVersion): -1 | 0 | 1 {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] < pb[key]) return -1;
    if (pa[key] > pb[key]) return 1;
  }
  return 0;
}

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
