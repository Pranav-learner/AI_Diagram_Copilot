/**
 * IntentHandler — the plug-in contract for a future AI capability.
 *
 * This is the extensibility payoff of the whole module. A new feature (generate,
 * edit, explain, review, import…) ships exactly three things and nothing else:
 *   1. an {@link Intent} it answers to,
 *   2. a prompt template (registered in the PromptRegistry), and
 *   3. a response {@link schema} — plus, for write features, a `toOperations`
 *      mapping into an {@link OperationPlan}.
 * Everything else — service, retries, context, validation, planning, metrics,
 * conversation — already exists and is reused unchanged. Read-only features
 * (explain, review) simply omit `toOperations`.
 */

import type { z } from 'zod';
import type { OperationPlan } from '../validation/schemas/operationPlan';
import type { TemplateRef } from '../planning/PromptBuilder';
import type { ModelTier } from '../core/AIConfig';
import type { Intent, IntentClassification, IntentInput } from '../planning/IntentAnalyzer';
import type { DiagramContext } from '../planning/ContextBuilder';

/** Everything a handler receives when turning a validated response into operations. */
export interface HandlerContext {
  readonly input: IntentInput;
  readonly classification: IntentClassification;
  readonly diagramContext?: DiagramContext;
}

export interface IntentHandler<Plan = unknown> {
  /** The intent this handler answers. */
  readonly intent: Intent;
  /** The prompt template to build the request from. */
  readonly promptTemplate: TemplateRef;
  /** Schema the model response is validated against (structured output). */
  readonly schema: z.ZodType<Plan>;
  /** Which model tier to route to. Defaults to the service default. */
  readonly tier?: ModelTier;
  /**
   * Compile the validated response into an executable {@link OperationPlan}.
   * Omit for read-only capabilities (explain, review) that mutate nothing.
   */
  toOperations?(plan: Plan, ctx: HandlerContext): OperationPlan;
}

/** Registry of {@link IntentHandler}s, keyed by intent. */
export class HandlerRegistry {
  private readonly handlers = new Map<Intent, IntentHandler>();

  register(handler: IntentHandler): this {
    this.handlers.set(handler.intent, handler as IntentHandler);
    return this;
  }

  has(intent: Intent): boolean {
    return this.handlers.has(intent);
  }

  get(intent: Intent): IntentHandler | undefined {
    return this.handlers.get(intent);
  }

  intents(): readonly Intent[] {
    return [...this.handlers.keys()];
  }
}
