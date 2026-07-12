/**
 * A cheap, provider-agnostic token estimator.
 *
 * Exact token counts require a model-specific tokenizer we deliberately do not
 * bundle. For budgeting decisions (context trimming, conversation windowing,
 * mock usage accounting) a stable heuristic is sufficient and dependency-free:
 * ~4 characters per token, the well-known rule of thumb for English/JSON. It is
 * intentionally an *estimate* — real usage always comes from the provider's
 * reported counts when available.
 */

import type { ChatMessage } from './types';

const CHARS_PER_TOKEN = 4;
/** Rough per-message overhead (role tags, delimiters) in the wire format. */
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Estimate the token count of a raw string. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimate the token count of a single chat message (content + overhead). */
export function estimateMessageTokens(message: ChatMessage): number {
  return estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS + estimateTokens(message.name ?? '');
}

/** Estimate the token count of a list of messages. */
export function estimateMessagesTokens(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const m of messages) total += estimateMessageTokens(m);
  return total;
}
