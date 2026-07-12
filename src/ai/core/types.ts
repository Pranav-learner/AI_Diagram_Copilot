/**
 * Core wire-neutral types for the AI layer.
 *
 * These describe an LLM exchange in a **provider-agnostic** shape: a list of
 * role-tagged messages in, a text (or structured) completion out, plus token
 * accounting. Every provider maps its own wire format to and from these types,
 * so the rest of the platform (prompt builder, service, conversation, planner)
 * never sees an OpenAI/Anthropic/Gemini-specific object. Switching providers is
 * therefore a registry change, not a type change.
 *
 * Everything here is plain, JSON-serializable, immutable data.
 */

/**
 * A structured problem report used across the AI layer (validation failures,
 * planning failures, intent issues). Deliberately local to the AI layer — it
 * does not reuse the DSL/engine issue types, so the AI layer stays decoupled.
 */
export interface AIIssue {
  readonly code: string;
  readonly message: string;
  /** Dotted path into the offending structure, when applicable. */
  readonly path?: string;
}

export function aiIssue(code: string, message: string, path?: string): AIIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

/** Who authored a message. `developer` is a higher-authority system channel. */
export type Role = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

/** A single turn in a conversation sent to / received from a model. */
export interface ChatMessage {
  readonly role: Role;
  readonly content: string;
  /** Optional author name (e.g. a tool name, or a named participant). */
  readonly name?: string;
  /** Non-transmitted bookkeeping (ids, timestamps) — providers ignore this. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A model identifier, e.g. `claude-opus-4-8`. Opaque to the platform. */
export type ModelId = string;

/**
 * How the model should shape its output. `json` asks the provider to constrain
 * output to valid JSON where supported (a hint — {@link ResponseValidator} is
 * still the authority; we never trust the model to obey).
 */
export interface ResponseFormat {
  readonly type: 'text' | 'json';
  /** Optional name of the structured schema the caller expects. */
  readonly schemaName?: string;
}

/** Sampling / generation controls, all optional and resolved from config. */
export interface GenerationParams {
  readonly model?: ModelId;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly stop?: readonly string[];
  readonly responseFormat?: ResponseFormat;
}

/** A completion request: the messages plus generation controls. */
export interface ChatRequest extends GenerationParams {
  readonly messages: readonly ChatMessage[];
}

/**
 * A {@link ChatRequest} with the model resolved to a concrete id. Providers
 * receive this — model selection/routing happens above them, never inside.
 */
export interface ResolvedRequest extends ChatRequest {
  readonly model: ModelId;
}

/** Why generation stopped. Normalized across providers. */
export type FinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_call'
  | 'cancelled'
  | 'error';

/** Token accounting for one exchange. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export const ZERO_USAGE: TokenUsage = Object.freeze({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
});

/** Add two usage records (for aggregating multi-call flows). */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** A finished completion, normalized. `raw` keeps the provider payload for debugging. */
export interface ChatResponse {
  readonly text: string;
  readonly finishReason: FinishReason;
  readonly model: ModelId;
  /** The provider id that produced this response (e.g. `anthropic`). */
  readonly provider: string;
  readonly usage: TokenUsage;
  readonly raw?: unknown;
}

/** One incremental chunk of a streamed completion. */
export interface StreamChunk {
  /** The text appended by this chunk (empty on the terminal chunk). */
  readonly delta: string;
  readonly done: boolean;
  readonly finishReason?: FinishReason;
  /** Present on the terminal chunk when the provider reports final usage. */
  readonly usage?: TokenUsage;
}
