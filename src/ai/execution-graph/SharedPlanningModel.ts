export interface SpmRetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
}

export interface SpmFailurePolicy {
  readonly policy: 'retry' | 'fallback' | 'skip' | 'abort';
  readonly fallbackUnitId?: string;
}

export interface SpmApprovalGate {
  readonly required: boolean;
  readonly permissionsRequired?: readonly string[];
  readonly message?: string;
}

export interface SpmResourceLimits {
  readonly concurrencyLimit?: number;
  readonly tokenLimit?: number;
  readonly costLimit?: number;
  readonly timeoutMs?: number;
}

export interface SpmTask {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unitId: string;
  readonly dependencies: readonly string[];
  readonly retryPolicy?: SpmRetryPolicy;
  readonly failurePolicy?: SpmFailurePolicy;
  readonly timeoutMs?: number;
  readonly approvalGate?: SpmApprovalGate;
  readonly resourceLimits?: SpmResourceLimits;
  readonly metadata?: Readonly<Record<string, any>>;
}

export interface SharedPlanningModel {
  readonly taskId: string;
  readonly sessionId: string;
  readonly goal: string;
  readonly tasks: readonly SpmTask[];
  readonly metadata?: Readonly<Record<string, any>>;
}
