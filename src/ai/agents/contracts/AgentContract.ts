import type { ExecutionContext } from '../../execution/ExecutionContext';
import type { ExecutionNode } from '../../execution-graph/ExecutionNode';

export interface AgentContext {
  readonly executionContext: ExecutionContext;
  readonly pim?: Record<string, any>;
  readonly ontology?: Record<string, any>;
  readonly evidence?: readonly any[];
  readonly node?: ExecutionNode;
  readonly assignedTask: string;
  readonly allowedTools: readonly string[];
  readonly permissions: readonly string[];
}

export interface AgentOutputIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface AgentOutput<T = any> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly validationMetadata?: {
    readonly validatedAt: Date;
    readonly rulesChecked: string[];
    readonly issues?: AgentOutputIssue[];
  };
  readonly evidence: readonly any[];
  readonly confidence: number;
  readonly recommendations: readonly string[];
  readonly executionMetadata: {
    readonly latencyMs: number;
    readonly tokenUsage?: {
      readonly promptTokens: number;
      readonly completionTokens: number;
      readonly totalTokens: number;
    };
    readonly modelUsed: string;
    readonly cost?: number;
    readonly retries?: number;
  };
}
