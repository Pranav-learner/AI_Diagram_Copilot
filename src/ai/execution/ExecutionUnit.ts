import type { TokenUsage } from '../core/types';
import type { ExecutionContext } from './ExecutionContext';

export type ExecutionUnitType =
  | 'agent'
  | 'tool'
  | 'human-review'
  | 'workflow-step'
  | 'background-job'
  | 'external-service'
  | 'plugin'
  | (string & {});

export interface ExecutionResult {
  readonly success: boolean;
  readonly data?: any;
  readonly error?: Error;
  readonly executionTimeMs: number;
  readonly tokenUsage?: TokenUsage;
  readonly metadata?: Readonly<Record<string, any>>;
}

export interface ExecutionUnit {
  readonly id: string;
  readonly name: string;
  readonly type: ExecutionUnitType;
  readonly version: string;

  initialize?(context: ExecutionContext): Promise<void>;
  validate?(context: ExecutionContext): Promise<boolean>;
  execute(context: ExecutionContext): Promise<ExecutionResult>;
  pause?(context: ExecutionContext): Promise<void>;
  resume?(context: ExecutionContext): Promise<void>;
  cancel?(context: ExecutionContext): Promise<void>;
  cleanup?(context: ExecutionContext): Promise<void>;
}
