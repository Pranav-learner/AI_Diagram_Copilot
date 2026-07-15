export type ExecutionPolicyType =
  | 'fail-fast'
  | 'continue-on-error'
  | 'best-effort'
  | 'strict-success';

export interface ExecutionPolicies {
  readonly policyType: ExecutionPolicyType;
  readonly globalConcurrencyLimit?: number;
  readonly globalTokenLimit?: number;
  readonly globalCostLimit?: number;
  readonly globalTimeoutMs?: number;
}
