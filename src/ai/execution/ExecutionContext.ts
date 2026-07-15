import type { TokenUsage } from '../core/types';

export interface ExecutionBudget {
  readonly timeoutMs?: number;
  readonly tokenLimit?: number;
  readonly costLimit?: number;
  readonly maxSteps?: number;
}

export interface ExecutionMetrics {
  executionTimeMs: number;
  tokensUsed: number;
  costUsed: number;
  stepsCount: number;
}

export class CancellationToken {
  private aborted = false;
  private reason?: string;
  private readonly signal?: AbortSignal;
  private readonly listeners: (() => void)[] = [];

  constructor(signal?: AbortSignal) {
    this.signal = signal;
    if (signal) {
      signal.addEventListener('abort', () => {
        this.aborted = true;
        this.reason = signal.reason || 'Cancelled';
        this.notifyListeners();
      });
    }
  }

  get isCancelled(): boolean {
    return this.aborted || (this.signal?.aborted ?? false);
  }

  get cancellationReason(): string | undefined {
    return this.reason || (this.signal?.reason as string) || undefined;
  }

  throwIfCancelled(): void {
    if (this.isCancelled) {
      throw new Error(this.cancellationReason || 'Execution cancelled');
    }
  }

  onCancel(callback: () => void): () => void {
    this.listeners.push(callback);
    if (this.isCancelled) {
      callback();
    }
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  cancel(reason?: string): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Suppress listener errors
      }
    }
  }
}

export interface ProgressUpdate {
  readonly progress: number; // 0 to 1
  readonly message?: string;
  readonly timestamp: Date;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export class ProgressReporter {
  private readonly listeners: ProgressCallback[] = [];

  subscribe(callback: ProgressCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  report(progress: number, message?: string): void {
    const update: ProgressUpdate = {
      progress: Math.max(0, Math.min(1, progress)),
      message,
      timestamp: new Date(),
    };
    for (const listener of this.listeners) {
      try {
        listener(update);
      } catch {
        // Suppress listener errors to avoid disrupting main flow
      }
    }
  }
}

export interface ExecutionContextOptions {
  readonly taskId: string;
  readonly sessionId: string;
  readonly userGoal: string;
  readonly pimEntities?: readonly string[];
  readonly ontologyConcepts?: readonly string[];
  readonly evidence?: readonly any[];
  readonly spmTask?: any;
  readonly permissions?: readonly string[];
  readonly cancellationToken?: CancellationToken;
  readonly progressReporter?: ProgressReporter;
  readonly traceId?: string;
  readonly budget?: ExecutionBudget;
  readonly metadata?: Record<string, any>;
  readonly metrics?: ExecutionMetrics;
}

export class ExecutionContext {
  readonly taskId: string;
  readonly sessionId: string;
  readonly userGoal: string;
  readonly pimEntities: readonly string[];
  readonly ontologyConcepts: readonly string[];
  readonly evidence: readonly any[];
  readonly spmTask: any;
  readonly permissions: readonly string[];
  readonly cancellationToken: CancellationToken;
  readonly progressReporter: ProgressReporter;
  readonly traceId: string;
  readonly budget: ExecutionBudget;
  readonly metadata: Record<string, any>;
  readonly metrics: ExecutionMetrics;

  constructor(options: ExecutionContextOptions) {
    this.taskId = options.taskId;
    this.sessionId = options.sessionId;
    this.userGoal = options.userGoal;
    this.pimEntities = options.pimEntities ?? [];
    this.ontologyConcepts = options.ontologyConcepts ?? [];
    this.evidence = options.evidence ?? [];
    this.spmTask = options.spmTask;
    this.permissions = options.permissions ?? [];
    this.cancellationToken = options.cancellationToken ?? new CancellationToken();
    this.progressReporter = options.progressReporter ?? new ProgressReporter();
    this.traceId = options.traceId ?? `trace-${Math.random().toString(36).substr(2, 9)}`;
    this.budget = options.budget ?? {};
    this.metadata = options.metadata ?? {};
    this.metrics = options.metrics ?? {
      executionTimeMs: 0,
      tokensUsed: 0,
      costUsed: 0,
      stepsCount: 0,
    };
  }

  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission) || this.permissions.includes('*');
  }

  checkCancellation(): void {
    this.cancellationToken.throwIfCancelled();
  }

  recordTokens(tokens: TokenUsage): void {
    this.metrics.tokensUsed += tokens.totalTokens;
    if (this.budget.tokenLimit && this.metrics.tokensUsed > this.budget.tokenLimit) {
      throw new Error(`Token budget exhausted: limit is ${this.budget.tokenLimit}, current usage is ${this.metrics.tokensUsed}`);
    }
  }

  recordCost(cost: number): void {
    this.metrics.costUsed += cost;
    if (this.budget.costLimit && this.metrics.costUsed > this.budget.costLimit) {
      throw new Error(`Cost budget exhausted: limit is ${this.budget.costLimit}, current usage is ${this.metrics.costUsed}`);
    }
  }

  incrementSteps(): void {
    this.metrics.stepsCount += 1;
    if (this.budget.maxSteps && this.metrics.stepsCount > this.budget.maxSteps) {
      throw new Error(`Execution step budget exhausted: limit is ${this.budget.maxSteps}`);
    }
  }

  reportProgress(progress: number, message?: string): void {
    this.progressReporter.report(progress, message);
  }

  addMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  clone(overrides?: Partial<ExecutionContextOptions>): ExecutionContext {
    return new ExecutionContext({
      taskId: overrides?.taskId ?? this.taskId,
      sessionId: overrides?.sessionId ?? this.sessionId,
      userGoal: overrides?.userGoal ?? this.userGoal,
      pimEntities: overrides?.pimEntities ?? this.pimEntities,
      ontologyConcepts: overrides?.ontologyConcepts ?? this.ontologyConcepts,
      evidence: overrides?.evidence ?? this.evidence,
      spmTask: overrides?.spmTask ?? this.spmTask,
      permissions: overrides?.permissions ?? this.permissions,
      cancellationToken: overrides?.cancellationToken ?? this.cancellationToken,
      progressReporter: overrides?.progressReporter ?? this.progressReporter,
      traceId: overrides?.traceId ?? this.traceId,
      budget: overrides?.budget ?? this.budget,
      metadata: overrides?.metadata ?? { ...this.metadata },
      metrics: overrides?.metrics ?? { ...this.metrics },
    });
  }
}
