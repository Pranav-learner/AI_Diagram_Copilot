/**
 * Deterministic gradient generator for project thumbnail placeholders.
 * Until diagram rendering exists, each project gets a stable, distinct gradient
 * derived from its id so the dashboard still feels distinctive.
 */

const GRADIENTS: readonly [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#22d3ee'],
  ['#f43f5e', '#f97316'],
  ['#10b981', '#84cc16'],
  ['#8b5cf6', '#ec4899'],
  ['#f59e0b', '#ef4444'],
  ['#14b8a6', '#3b82f6'],
  ['#a855f7', '#6366f1'],
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export interface ThumbnailGradient {
  from: string;
  to: string;
  /** Ready-to-use CSS `background` value. */
  css: string;
}

/** Stable gradient for a given project id. */
export function getThumbnailGradient(id: string): ThumbnailGradient {
  const [from, to] = GRADIENTS[hash(id) % GRADIENTS.length]!;
  return {
    from,
    to,
    css: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  };
}
