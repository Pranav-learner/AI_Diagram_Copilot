import type { ExecutionFramework } from '../execution/ExecutionFramework';
import type { ExecutionContext } from '../execution/ExecutionContext';
import type { ExecutionGraph } from '../execution-graph/ExecutionGraph';
import type { ExecutionNode } from '../execution-graph/ExecutionNode';
import { Scheduler } from './Scheduler';
import { ResourceManager } from './ResourceManager';
import { CheckpointManager, type CheckpointState } from './CheckpointManager';
import { FailureManager } from './FailureManager';
import { ApprovalManager } from './ApprovalManager';
import { ProgressTracker } from './progress/ProgressTracker';
import type { ExecutionPolicies } from './policies/ExecutionPolicies';
import type { OrchestratorEvent } from './events/OrchestratorEvents';
import type { EventBus } from '../events/EventBus';

export interface OrchestratorOptions {
  readonly policies?: ExecutionPolicies;
  readonly rollbackHooks?: Map<string, () => Promise<void>>;
  readonly eventBus?: EventBus;
}

export class ExecutionOrchestrator {
  private readonly framework: ExecutionFramework;
  private readonly options: OrchestratorOptions;
  private readonly nodeResults = new Map<string, any>();
  private readonly nodeErrors = new Map<string, Error>();
  private readonly runningNodes = new Set<string>();

  private graph!: ExecutionGraph;
  private initialContext!: ExecutionContext;
  private scheduler!: Scheduler;
  private resourceManager!: ResourceManager;
  private progressTracker!: ProgressTracker;
  private readonly approvalManager = new ApprovalManager();
  private pendingCheckpointState?: CheckpointState;

  private paused = false;
  private completed = false;
  private resolvePromise?: (results: ReadonlyMap<string, any>) => void;
  private rejectPromise?: (error: Error) => void;

  constructor(framework: ExecutionFramework, options: OrchestratorOptions = {}) {
    this.framework = framework;
    this.options = options;
  }

  async execute(
    graph: ExecutionGraph,
    initialContext: ExecutionContext
  ): Promise<ReadonlyMap<string, any>> {
    this.graph = graph;
    this.initialContext = initialContext;
    
    if (this.pendingCheckpointState) {
      this.scheduler = new Scheduler(graph);
      this.resourceManager = new ResourceManager(this.options.policies);
      this.progressTracker = new ProgressTracker(graph);

      for (const [nodeId, status] of Object.entries(this.pendingCheckpointState.nodeStatuses)) {
        this.scheduler.setStatus(nodeId, status);
      }
      for (const [nodeId, result] of Object.entries(this.pendingCheckpointState.nodeResults)) {
        this.nodeResults.set(nodeId, result);
      }
      for (const [nodeId, errData] of Object.entries(this.pendingCheckpointState.nodeErrors)) {
        this.nodeErrors.set(nodeId, new Error(errData.message));
      }
      Object.assign(this.initialContext.metadata, this.pendingCheckpointState.contextMetadata);

      this.pendingCheckpointState = undefined;
    } else if (!this.scheduler) {
      this.scheduler = new Scheduler(graph);
      this.resourceManager = new ResourceManager(this.options.policies);
      this.progressTracker = new ProgressTracker(graph);
    }

    this.paused = false;
    this.completed = false;

    return new Promise<ReadonlyMap<string, any>>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      this.publishEvent({
        type: 'workflow:started',
        timestamp: new Date(),
        taskId: graph.taskId,
        sessionId: graph.sessionId,
        goal: graph.goal,
      })
        .then(() => {
          this.triggerScheduler();
        })
        .catch(reject);
    });
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.triggerScheduler();
  }

  checkpoint(): string {
    if (!this.graph) {
      throw new Error('No execution in progress to checkpoint');
    }
    return CheckpointManager.serialize(
      this.graph.taskId,
      this.graph.sessionId,
      this.scheduler.getNodeStatuses(),
      this.nodeResults,
      this.nodeErrors,
      this.initialContext.metadata
    );
  }

  loadCheckpoint(checkpointJson: string): void {
    const state = CheckpointManager.deserialize(checkpointJson);
    this.pendingCheckpointState = state;
    
    if (this.scheduler) {
      for (const [nodeId, status] of Object.entries(state.nodeStatuses)) {
        this.scheduler.setStatus(nodeId, status);
      }
      for (const [nodeId, result] of Object.entries(state.nodeResults)) {
        this.nodeResults.set(nodeId, result);
      }
      for (const [nodeId, errData] of Object.entries(state.nodeErrors)) {
        this.nodeErrors.set(nodeId, new Error(errData.message));
      }
      if (this.initialContext) {
        Object.assign(this.initialContext.metadata, state.contextMetadata);
      }
      this.pendingCheckpointState = undefined;
    }
  }

  approveNode(nodeId: string): void {
    this.approvalManager.approve(nodeId);
  }

  rejectNode(nodeId: string, reason: string): void {
    this.approvalManager.reject(nodeId, reason);
  }

  getProgress() {
    if (!this.scheduler) return null;
    return this.progressTracker.getProgress(this.scheduler.getNodeStatuses());
  }

  getPendingApprovals(): readonly string[] {
    return this.approvalManager.getPendingNodeIds();
  }

  private triggerScheduler(): void {
    if (this.paused || this.completed) return;

    try {
      this.resourceManager.checkTimeout();
    } catch (err: any) {
      this.failWorkflow(err);
      return;
    }

    const readyNodes = this.scheduler.getReadyNodes(this.initialContext, this.nodeResults);

    for (const node of readyNodes) {
      if (this.runningNodes.has(node.id)) continue;

      const status = this.scheduler.getStatus(node.id);
      if (status === 'completed' || status === 'skipped' || status === 'failed') continue;

      this.runningNodes.add(node.id);
      this.scheduler.setStatus(node.id, 'running');
      this.progressTracker.recordNodeStart(node.id);

      this.executeNode(node).catch((err) => {
        this.handleNodeSystemError(node, err);
      });
    }

    if (this.scheduler.isWorkflowComplete() && !this.completed) {
      this.finishWorkflow();
    }
  }

  private async executeNode(node: ExecutionNode): Promise<void> {
    await this.resourceManager.acquireSlot(node);

    try {
      this.initialContext.cancellationToken.throwIfCancelled();

      await this.publishEvent({
        type: 'node:started',
        timestamp: new Date(),
        taskId: this.graph.taskId,
        sessionId: this.graph.sessionId,
        nodeId: node.id,
        nodeName: node.name,
      });

      // Intercept execution if Approval Gate is required
      if (this.approvalManager.requiresApproval(node)) {
        await new Promise<void>((resolve, reject) => {
          this.approvalManager.requestApproval(
            node,
            () => resolve(),
            (reason) => reject(new Error(`Approval rejected: ${reason}`))
          );

          this.publishEvent({
            type: 'approval:requested',
            timestamp: new Date(),
            taskId: this.graph.taskId,
            sessionId: this.graph.sessionId,
            nodeId: node.id,
            message: node.approvalGate?.message || `Approval required to execute node "${node.name}"`,
            approve: () => this.approvalManager.approve(node.id),
            reject: (reason) => this.approvalManager.reject(node.id, reason),
          }).catch(() => {});
        });
      }

      let attempt = 0;
      let result: any;

      while (true) {
        attempt++;
        try {
          const nodeContext = this.initialContext.clone({
            budget: {
              timeoutMs: node.timeoutMs || this.initialContext.budget.timeoutMs,
              ...node.resourceLimits,
            },
            metadata: {
              ...this.initialContext.metadata,
              nodeResults: Object.fromEntries(this.nodeResults),
              nodeAttempt: attempt,
            },
          });

          if (!node.unitId) {
            result = { success: true, data: {} };
          } else {
            result = await this.framework.run(node.unitId, nodeContext);
          }

          if (result.success) {
            this.nodeResults.set(node.id, result.data);
            break;
          } else {
            throw result.error || new Error(`Execution of unit "${node.unitId}" failed`);
          }
        } catch (err: any) {
          if (FailureManager.shouldRetry(node, attempt) && !this.initialContext.cancellationToken.isCancelled) {
            await this.publishEvent({
              type: 'node:retry',
              timestamp: new Date(),
              taskId: this.graph.taskId,
              sessionId: this.graph.sessionId,
              nodeId: node.id,
              attempt,
              error: err,
            });

            const delay = FailureManager.getRetryDelay(node, attempt);
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
          } else {
            throw err;
          }
        }
      }

      this.scheduler.setStatus(node.id, 'completed');
      this.progressTracker.recordNodeEnd(node.id);
      this.runningNodes.delete(node.id);

      await this.publishEvent({
        type: 'node:completed',
        timestamp: new Date(),
        taskId: this.graph.taskId,
        sessionId: this.graph.sessionId,
        nodeId: node.id,
        result: this.nodeResults.get(node.id),
      });
    } catch (err: any) {
      const rollback = this.options.rollbackHooks?.get(node.id);
      const action = await FailureManager.handleFailure(node, err, rollback);

      if (action === 'skip') {
        this.scheduler.setStatus(node.id, 'skipped');
        this.progressTracker.recordNodeEnd(node.id);
        this.runningNodes.delete(node.id);

        await this.publishEvent({
          type: 'node:completed',
          timestamp: new Date(),
          taskId: this.graph.taskId,
          sessionId: this.graph.sessionId,
          nodeId: node.id,
          result: { skipped: true },
        });
      } else if (action === 'fallback' && node.failurePolicy?.fallbackUnitId) {
        try {
          const fallbackContext = this.initialContext.clone();
          const fallbackResult = await this.framework.run(node.failurePolicy.fallbackUnitId, fallbackContext);
          
          if (fallbackResult.success) {
            this.nodeResults.set(node.id, fallbackResult.data);
            this.scheduler.setStatus(node.id, 'completed');
            this.progressTracker.recordNodeEnd(node.id);
            this.runningNodes.delete(node.id);

            await this.publishEvent({
              type: 'node:completed',
              timestamp: new Date(),
              taskId: this.graph.taskId,
              sessionId: this.graph.sessionId,
              nodeId: node.id,
              result: fallbackResult.data,
            });
          } else {
            throw fallbackResult.error || new Error('Fallback execution failed');
          }
        } catch (fallbackErr: any) {
          await this.markNodeFailed(node, fallbackErr);
        }
      } else {
        await this.markNodeFailed(node, err);

        const policy = this.options.policies?.policyType || 'fail-fast';
        if (policy === 'fail-fast' || policy === 'strict-success') {
          this.initialContext.cancellationToken.cancel(
            `Workflow cancelled due to failure on node "${node.id}"`
          );
        }
      }
    } finally {
      this.resourceManager.releaseSlot(node);
      this.triggerScheduler();
    }
  }

  private async markNodeFailed(node: ExecutionNode, error: Error): Promise<void> {
    this.scheduler.setStatus(node.id, 'failed');
    this.progressTracker.recordNodeEnd(node.id);
    this.nodeErrors.set(node.id, error);
    this.runningNodes.delete(node.id);

    await this.publishEvent({
      type: 'node:failed',
      timestamp: new Date(),
      taskId: this.graph.taskId,
      sessionId: this.graph.sessionId,
      nodeId: node.id,
      error,
    });
  }

  private handleNodeSystemError(node: ExecutionNode, error: Error): void {
    this.markNodeFailed(node, error).then(() => {
      this.triggerScheduler();
    }).catch(() => {});
  }

  private finishWorkflow(): void {
    this.completed = true;

    // Populate results for skipped nodes
    for (const nodeId of this.graph.nodes.keys()) {
      if (this.scheduler.getStatus(nodeId) === 'skipped') {
        this.nodeResults.set(nodeId, { skipped: true });
      }
    }

    const hasFailures = this.scheduler.hasFailures();
    
    this.publishEvent({
      type: 'workflow:completed',
      timestamp: new Date(),
      taskId: this.graph.taskId,
      sessionId: this.graph.sessionId,
      success: !hasFailures,
      results: this.nodeResults,
      errors: this.nodeErrors,
    })
      .then(() => {
        if (hasFailures && (this.options.policies?.policyType === 'strict-success' || this.options.policies?.policyType === 'fail-fast')) {
          const firstError = Array.from(this.nodeErrors.values())[0];
          this.rejectPromise?.(firstError || new Error('Workflow execution failed'));
        } else {
          this.resolvePromise?.(this.nodeResults);
        }
      })
      .catch((err) => this.rejectPromise?.(err));
  }

  private failWorkflow(error: Error): void {
    this.completed = true;
    this.publishEvent({
      type: 'workflow:completed',
      timestamp: new Date(),
      taskId: this.graph.taskId,
      sessionId: this.graph.sessionId,
      success: false,
      results: this.nodeResults,
      errors: this.nodeErrors,
    })
      .then(() => {
        this.rejectPromise?.(error);
      })
      .catch((err) => this.rejectPromise?.(err));
  }

  private async publishEvent(event: OrchestratorEvent): Promise<void> {
    if (this.options.eventBus) {
      this.options.eventBus.publish(event);
    }
  }
}
