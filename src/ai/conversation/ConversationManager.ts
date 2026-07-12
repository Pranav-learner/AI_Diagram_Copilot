/**
 * ConversationManager — conversation identity, history, windowing, streaming.
 *
 * Owns the set of conversations and the operations the platform needs:
 *   • ids + message history (the "PromptHistory" store);
 *   • context-window management — {@link window} selects the most recent turns
 *     that fit a token budget, prepending any rolling summary, so a long chat
 *     never blows the model's context;
 *   • a summarization *hook* ({@link compact}) — pluggable {@link Summarizer},
 *     intentionally not implemented here (memory is out of scope);
 *   • streaming ingest — {@link recordStream} passes chunks through while
 *     accumulating the final assistant message into history.
 *
 * Ids and time are injected so behaviour is deterministic under test.
 */

import type { ChatMessage, Role, StreamChunk } from '../core/types';
import { estimateMessageTokens } from '../core/tokens';
import type { Conversation, ConversationMessage } from './Conversation';
import { toChatMessage } from './Conversation';

/** The summarization hook. A future module supplies an implementation. */
export interface Summarizer {
  summarize(messages: readonly ChatMessage[], previousSummary?: string): Promise<string>;
}

export interface ConversationManagerDeps {
  /** Unique id generator. Defaults to a per-instance monotonic counter. */
  readonly ids?: () => string;
  readonly now?: () => number;
  /** Default token budget for {@link window}. */
  readonly maxContextTokens?: number;
  readonly summarizer?: Summarizer;
}

export interface CreateConversationOptions {
  readonly id?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class ConversationManager {
  private readonly conversations = new Map<string, Conversation>();
  private readonly makeId: () => string;
  private readonly now: () => number;
  private readonly maxContextTokens: number;
  private readonly summarizer?: Summarizer;
  private counter = 0;

  constructor(deps: ConversationManagerDeps = {}) {
    this.makeId = deps.ids ?? (() => `conv_${++this.counter}`);
    this.now = deps.now ?? (() => Date.now());
    this.maxContextTokens = deps.maxContextTokens ?? 8_000;
    this.summarizer = deps.summarizer;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(options: CreateConversationOptions = {}): Conversation {
    const now = this.now();
    const conversation: Conversation = {
      id: options.id ?? this.makeId(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: options.metadata,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  list(): readonly Conversation[] {
    return [...this.conversations.values()];
  }

  delete(id: string): boolean {
    return this.conversations.delete(id);
  }

  // ── History ────────────────────────────────────────────────────────────────

  /** Append one message, returning the updated conversation. */
  append(id: string, message: ChatMessage): Conversation {
    const conversation = this.require(id);
    const stored: ConversationMessage = {
      ...message,
      id: this.makeId(),
      createdAt: this.now(),
    };
    const updated: Conversation = {
      ...conversation,
      messages: [...conversation.messages, stored],
      updatedAt: stored.createdAt,
    };
    this.conversations.set(id, updated);
    return updated;
  }

  /** Convenience: append a user or assistant turn from raw text. */
  appendText(id: string, role: Role, content: string): Conversation {
    return this.append(id, { role, content });
  }

  // ── Context window management ────────────────────────────────────────────────

  /**
   * Select the most recent messages that fit `budgetTokens` (default: the
   * manager's budget), newest-first-fill then chronological order. Any rolling
   * `summary` is prepended as a system message and counts against the budget.
   */
  window(id: string, budgetTokens = this.maxContextTokens): ChatMessage[] {
    const conversation = this.require(id);
    const result: ChatMessage[] = [];
    let used = 0;

    const summaryMessage: ChatMessage | undefined = conversation.summary
      ? { role: 'system', content: `Conversation summary so far:\n${conversation.summary}` }
      : undefined;
    if (summaryMessage) used += estimateMessageTokens(summaryMessage);

    // Walk newest → oldest, taking messages until the budget is exhausted.
    const chosen: ConversationMessage[] = [];
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const message = conversation.messages[i]!;
      const cost = estimateMessageTokens(message);
      if (used + cost > budgetTokens && chosen.length > 0) break;
      used += cost;
      chosen.push(message);
    }
    chosen.reverse();

    if (summaryMessage) result.push(summaryMessage);
    for (const message of chosen) result.push(toChatMessage(message));
    return result;
  }

  // ── Summarization hook (not an implementation) ───────────────────────────────

  /**
   * Fold all but the `keepRecent` newest messages into the rolling `summary`
   * via the injected {@link Summarizer}. No-op (returns unchanged) if no
   * summarizer is configured — the platform ships the seam, not the policy.
   */
  async compact(id: string, keepRecent = 6): Promise<Conversation> {
    const conversation = this.require(id);
    if (!this.summarizer || conversation.messages.length <= keepRecent) return conversation;

    const cut = conversation.messages.length - keepRecent;
    const older = conversation.messages.slice(0, cut).map(toChatMessage);
    const summary = await this.summarizer.summarize(older, conversation.summary);
    const updated: Conversation = {
      ...conversation,
      summary,
      messages: conversation.messages.slice(cut),
      updatedAt: this.now(),
    };
    this.conversations.set(id, updated);
    return updated;
  }

  // ── Streaming ingest ─────────────────────────────────────────────────────────

  /**
   * Pass a completion stream through to the caller while accumulating the full
   * assistant text; append it as one message when the stream completes.
   */
  async *recordStream(id: string, stream: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    let text = '';
    for await (const chunk of stream) {
      text += chunk.delta;
      yield chunk;
    }
    this.append(id, { role: 'assistant', content: text });
  }

  private require(id: string): Conversation {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error(`Unknown conversation "${id}"`);
    return conversation;
  }
}
