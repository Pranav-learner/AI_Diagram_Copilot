/**
 * Per-operation renderer context.
 *
 * Threaded through every mapper call. Carries the resolved config, the DSL
 * {@link NodeTypeRegistry} (so semantic node types resolve consistently with how
 * they were authored), and a mutable `warnings` sink mappers push to. A fresh
 * context is created per top-level engine operation so warnings never leak
 * across renders.
 */

import type { NodeTypeRegistry, Clock } from '@/dsl';
import { defaultNodeTypeRegistry, systemClock } from '@/dsl';
import type { Warning } from '../types';
import type { EngineConfig } from './RendererConfig';
import { resolveConfig } from './RendererConfig';

export interface RendererContext {
  readonly config: EngineConfig;
  readonly nodeTypes: NodeTypeRegistry;
  /** Supplies timestamps when `parse` reconstructs DSL entities from manual edits. */
  readonly clock: Clock;
  /** Mutable collector; mappers call `warn(...)`, the engine returns the list. */
  readonly warnings: Warning[];
  warn(warning: Warning): void;
}

export interface CreateContextOptions {
  readonly config?: EngineConfig;
  readonly nodeTypes?: NodeTypeRegistry;
  readonly clock?: Clock;
}

/** Build a fresh context (with an empty warning sink) for one operation. */
export function createContext(options: CreateContextOptions = {}): RendererContext {
  const warnings: Warning[] = [];
  return {
    config: options.config ?? resolveConfig(),
    nodeTypes: options.nodeTypes ?? defaultNodeTypeRegistry,
    clock: options.clock ?? systemClock,
    warnings,
    warn(warning: Warning) {
      warnings.push(warning);
    },
  };
}
