/**
 * OperationRegistry — reconstruct operations from `{ type, params }` data.
 *
 * The direct API (`moveNode(id, pos)`) is the common path; the registry is the
 * seam for data-driven producers: a Phase-3 AI planner or a serialized operation
 * log emits `{ type, params }` and the registry rebuilds the typed operation.
 * Extensible — register a new type without touching the runtime.
 */

import type { Operation } from '../operations/Operation';
import { OperationNotFoundError } from '../errors';

export type OperationParams = Record<string, unknown>;
export type OperationFactory = (params: OperationParams) => Operation;

export class OperationRegistry {
  private readonly factories = new Map<string, OperationFactory>();

  register(type: string, factory: OperationFactory): this {
    this.factories.set(type, factory);
    return this;
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  create(type: string, params: OperationParams = {}): Operation {
    const factory = this.factories.get(type);
    if (!factory) throw new OperationNotFoundError(type);
    return factory(params);
  }

  types(): readonly string[] {
    return [...this.factories.keys()];
  }
}
