import type { ExecutionNode } from '../execution-graph/ExecutionNode';

export interface ResourceManagerOptions {
  readonly concurrencyLimit?: number;
  readonly tokenLimit?: number;
  readonly costLimit?: number;
  readonly timeoutMs?: number;
}

export class ResourceManager {
  private activeCount = 0;
  private readonly queue: (() => void)[] = [];

  private tokensUsed = 0;
  private costUsed = 0;
  private readonly startTime: number;

  readonly concurrencyLimit: number;
  readonly tokenLimit: number;
  readonly costLimit: number;
  readonly timeoutMs: number;

  constructor(options: ResourceManagerOptions = {}) {
    this.concurrencyLimit = options.concurrencyLimit ?? 10;
    this.tokenLimit = options.tokenLimit ?? Infinity;
    this.costLimit = options.costLimit ?? Infinity;
    this.timeoutMs = options.timeoutMs ?? Infinity;
    this.startTime = Date.now();
  }

  async acquireSlot(node: ExecutionNode): Promise<void> {
    this.checkTimeout();

    // Check specific node limits if provided
    const nodeConcurrency = node.resourceLimits?.concurrencyLimit ?? this.concurrencyLimit;

    if (this.activeCount < nodeConcurrency) {
      this.activeCount++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  releaseSlot(node: ExecutionNode): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      this.activeCount++;
      next();
    }
  }

  recordTokens(tokens: number): void {
    this.tokensUsed += tokens;
    if (this.tokensUsed > this.tokenLimit) {
      throw new Error(`Global token limit exceeded: used ${this.tokensUsed}, limit is ${this.tokenLimit}`);
    }
  }

  recordCost(cost: number): void {
    this.costUsed += cost;
    if (this.costUsed > this.costLimit) {
      throw new Error(`Global cost limit exceeded: used ${this.costUsed}, limit is ${this.costUsed}`);
    }
  }

  checkTimeout(): void {
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.timeoutMs) {
      throw new Error(`Global execution timeout exceeded: ${elapsed}ms > ${this.timeoutMs}ms`);
    }
  }

  getMetrics() {
    return {
      activeConcurrency: this.activeCount,
      tokensUsed: this.tokensUsed,
      costUsed: this.costUsed,
      elapsedMs: Date.now() - this.startTime,
    };
  }
}
