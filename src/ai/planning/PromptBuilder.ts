/**
 * PromptBuilder — structured, versioned prompt assembly.
 *
 * Prompts are never string-concatenated at call sites. A {@link PromptTemplate}
 * (system + developer channels, few-shot examples, a version) lives in the
 * {@link PromptRegistry}; the builder composes it with injected context and
 * conversation history into the final {@link ChatMessage} array. This makes
 * prompts centralized, versioned (A/B a `v2` without deleting `v1`), and
 * inspectable. Every future feature ships a template and reuses this assembler
 * unchanged.
 *
 * Message order (the contract downstream depends on): system → developer →
 * few-shot pairs → prior conversation → injected context → the new user turn.
 */

import type { ChatMessage } from '../core/types';
import { AIConfigError } from '../core/AIError';

/** A canonical identity preamble features can compose into their system prompt. */
export const BASE_SYSTEM_PROMPT =
  'You are the AI Diagram Copilot, an expert assistant embedded in a diagram editor. ' +
  'You reason about diagrams as structured data and never fabricate ids or fields you were not given.';

export interface FewShotExample {
  readonly user: string;
  readonly assistant: string;
}

export interface PromptTemplate {
  /** Stable id, e.g. `diagram.generate`. */
  readonly id: string;
  /** Template version, e.g. `v1`. Multiple versions of an id coexist. */
  readonly version: string;
  /** The system channel (identity, rules, output contract). */
  readonly system: string;
  /** Higher-authority developer channel (constraints that override the user). */
  readonly developer?: string;
  readonly fewShot?: readonly FewShotExample[];
}

/** A reference to a template: an object, or an id (+ optional version) to resolve. */
export type TemplateRef = PromptTemplate | { readonly id: string; readonly version?: string };

export class PromptRegistry {
  private readonly byKey = new Map<string, PromptTemplate>();
  /** Latest registered version per id. */
  private readonly latest = new Map<string, string>();

  /** Register (or replace) a template version. Chainable. */
  register(template: PromptTemplate): this {
    this.byKey.set(key(template.id, template.version), template);
    this.latest.set(template.id, template.version);
    return this;
  }

  has(id: string, version?: string): boolean {
    const v = version ?? this.latest.get(id);
    return v !== undefined && this.byKey.has(key(id, v));
  }

  /** Resolve a template; defaults to the latest registered version of `id`. */
  get(id: string, version?: string): PromptTemplate {
    const v = version ?? this.latest.get(id);
    const template = v !== undefined ? this.byKey.get(key(id, v)) : undefined;
    if (!template) throw new AIConfigError(`No prompt template "${id}"${version ? `@${version}` : ''} registered`);
    return template;
  }

  versions(id: string): readonly string[] {
    return [...this.byKey.values()].filter((t) => t.id === id).map((t) => t.version);
  }
}

export interface PromptBuildInput {
  readonly template: TemplateRef;
  /** The new user turn. */
  readonly user: string;
  /** Rendered diagram/context block (from {@link ContextBuilder}) to inject. */
  readonly contextBlock?: string;
  /** Prior conversation turns to include (already windowed). */
  readonly conversation?: readonly ChatMessage[];
  /** `{{name}}` substitutions applied to system/developer/user text. */
  readonly variables?: Readonly<Record<string, string>>;
}

export interface PromptBuilderOptions {
  readonly registry?: PromptRegistry;
}

export class PromptBuilder {
  private readonly registry: PromptRegistry;

  constructor(options: PromptBuilderOptions = {}) {
    this.registry = options.registry ?? new PromptRegistry();
  }

  get registryRef(): PromptRegistry {
    return this.registry;
  }

  /** Assemble the final message array for a completion request. */
  build(input: PromptBuildInput): ChatMessage[] {
    const template = this.resolve(input.template);
    const vars = input.variables ?? {};
    const messages: ChatMessage[] = [];

    messages.push({ role: 'system', content: interpolate(template.system, vars) });
    if (template.developer) messages.push({ role: 'developer', content: interpolate(template.developer, vars) });

    for (const ex of template.fewShot ?? []) {
      messages.push({ role: 'user', content: ex.user, metadata: { fewShot: true } });
      messages.push({ role: 'assistant', content: ex.assistant, metadata: { fewShot: true } });
    }

    if (input.conversation) messages.push(...input.conversation);

    // Inject fresh context on the developer channel, right before the new turn.
    if (input.contextBlock) {
      messages.push({ role: 'developer', content: `Current diagram context:\n${input.contextBlock}` });
    }

    messages.push({ role: 'user', content: interpolate(input.user, vars) });
    return messages;
  }

  private resolve(ref: TemplateRef): PromptTemplate {
    return 'system' in ref ? ref : this.registry.get(ref.id, ref.version);
  }
}

function key(id: string, version: string): string {
  return `${id}@${version}`;
}

/** Replace `{{name}}` tokens with provided variables (unknown tokens are left intact). */
function interpolate(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => vars[name] ?? match);
}
