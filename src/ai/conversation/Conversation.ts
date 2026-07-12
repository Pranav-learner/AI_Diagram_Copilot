/**
 * Conversation types — immutable, serializable records of a dialogue.
 *
 * A {@link Conversation} is plain data (id, ordered messages, an optional rolling
 * `summary` of compacted history, metadata) so it can be persisted and restored
 * as-is. Long-term memory is explicitly out of scope for this module — the
 * `summary` field is the *hook* a future memory/summarization system fills, not
 * an implementation of one.
 */

import type { ChatMessage } from '../core/types';

/** A stored message: a {@link ChatMessage} with identity and a timestamp. */
export interface ConversationMessage extends ChatMessage {
  readonly id: string;
  readonly createdAt: number;
}

export interface Conversation {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
  /** Rolling summary of messages compacted out of the live window (hook). */
  readonly summary?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Strip storage fields back to a plain {@link ChatMessage} for sending. */
export function toChatMessage(message: ConversationMessage): ChatMessage {
  const base: ChatMessage = { role: message.role, content: message.content };
  return message.name ? { ...base, name: message.name } : base;
}
