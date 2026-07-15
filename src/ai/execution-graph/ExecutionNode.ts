import type {
  SpmRetryPolicy,
  SpmFailurePolicy,
  SpmApprovalGate,
  SpmResourceLimits,
} from './SharedPlanningModel';

export type ExecutionNodeType = 'task' | 'group' | 'approval' | 'condition' | 'failure-handler';

export interface ExecutionNode {
  readonly id: string;
  readonly name: string;
  readonly type: ExecutionNodeType;
  readonly unitId?: string;
  readonly dependencies: readonly string[];
  readonly retryPolicy?: SpmRetryPolicy;
  readonly failurePolicy?: SpmFailurePolicy;
  readonly timeoutMs?: number;
  readonly approvalGate?: SpmApprovalGate;
  readonly resourceLimits?: SpmResourceLimits;
  readonly metadata?: Readonly<Record<string, any>>;
  
  // For group nodes (composite sub-graphs)
  readonly groupType?: 'parallel' | 'sequential';
  readonly childNodes?: readonly string[];
}
