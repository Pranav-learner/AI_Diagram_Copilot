import type { Mission } from '../Mission';
import { MissionContext } from '../MissionContext';
import { MissionPlanner } from '../MissionPlanner';
import { MissionValidator } from '../MissionValidator';
import { MissionDashboard } from '../MissionDashboard';
import { MissionAggregator, type MissionAggregatedOutput } from './MissionAggregator';
import { ExecutionOrchestrator } from '../../orchestrator/ExecutionOrchestrator';
import { ExecutionFramework } from '../../execution/ExecutionFramework';
import type { MissionHistoryStore } from '../MissionHistory';
import type { ExecutionGraph } from '../../execution-graph/ExecutionGraph';

export class MissionCoordinator {
  private readonly framework: ExecutionFramework;
  private readonly historyStore?: MissionHistoryStore;
  private orchestrator?: ExecutionOrchestrator;
  private graph?: ExecutionGraph;
  private activeContext?: MissionContext;
  private startTime = 0;
  private pendingCheckpointJson?: string;

  // Real-time trackers for Dashboard
  private readonly runningNodeIds = new Set<string>();
  private readonly completedNodeIds = new Set<string>();
  private readonly failedNodeIds = new Set<string>();
  private readonly retryCounts = new Map<string, number>();

  constructor(framework: ExecutionFramework, historyStore?: MissionHistoryStore) {
    this.framework = framework;
    this.historyStore = historyStore;
  }

  async run(context: MissionContext): Promise<MissionAggregatedOutput> {
    this.activeContext = context;
    const mission = context.mission;
    mission.status = 'planning';
    this.startTime = Date.now();

    // 1. Plan and compile the mission
    const spm = MissionPlanner.plan(mission, context.executionContext.sessionId);
    this.graph = MissionPlanner.compile(spm);

    // 2. Set up ExecutionOrchestrator
    const eventBus = this.framework.events;
    this.orchestrator = new ExecutionOrchestrator(this.framework, { eventBus });

    if (this.pendingCheckpointJson) {
      this.orchestrator.loadCheckpoint(this.pendingCheckpointJson);
      this.pendingCheckpointJson = undefined;
    }

    // Initialize trackers
    this.runningNodeIds.clear();
    this.completedNodeIds.clear();
    this.failedNodeIds.clear();
    this.retryCounts.clear();

    // Subscribe to orchestrator execution event changes
    const unsubscribeList = [
      eventBus.subscribe('node:started', (event: any) => {
        this.runningNodeIds.add(event.nodeId);
        const obj = mission.objectives.find((o) => o.id === event.nodeId);
        if (obj) {
          (obj as any).status = 'running';
        }
      }),
      eventBus.subscribe('node:completed', (event: any) => {
        this.runningNodeIds.delete(event.nodeId);
        this.completedNodeIds.add(event.nodeId);
        const obj = mission.objectives.find((o) => o.id === event.nodeId);
        if (obj) {
          (obj as any).status = 'completed';
        }
        this.updateProgress();
      }),
      eventBus.subscribe('node:failed', (event: any) => {
        this.runningNodeIds.delete(event.nodeId);
        this.failedNodeIds.add(event.nodeId);
        const obj = mission.objectives.find((o) => o.id === event.nodeId);
        if (obj) {
          (obj as any).status = 'failed';
        }
      }),
      eventBus.subscribe('node:retry', (event: any) => {
        const count = this.retryCounts.get(event.nodeId) || 0;
        this.retryCounts.set(event.nodeId, count + 1);
      }),
    ];

    mission.status = 'running';

    try {
      // 3. Execute Graph
      const results = await this.orchestrator.execute(this.graph, context.executionContext);

      // Clean up subscriptions
      unsubscribeList.forEach((unsub) => unsub());

      if (context.executionContext.cancellationToken.isCancelled) {
        mission.status = 'cancelled';
        throw new Error(context.executionContext.cancellationToken.reason || 'Mission cancelled by user');
      }

      // 4. Update success criteria checks based on completed tasks
      for (const obj of mission.objectives) {
        const res = results.get(obj.id);
        if (res && res.success) {
          const crit = mission.successCriteria.find((c) => c.id === `${obj.id}_crit`);
          if (crit) {
            crit.checked = true;
            crit.passed = true;
          }
        }
      }

      // 5. Final Mission Validation
      const validation = MissionValidator.validate(
        mission,
        results,
        context.executionContext.metadata.ontology
      );
      if (!validation.success) {
        mission.status = 'failed';
        throw new Error(`Mission validation failed: ${validation.errors.join('; ')}`);
      }

      mission.status = 'completed';
      mission.progress = 1.0;

      const durationMs = Date.now() - this.startTime;
      const aggregated = MissionAggregator.aggregate(mission, results, durationMs);

      // 6. Pluggable history persistence
      if (this.historyStore) {
        await this.historyStore.saveRecord({
          missionId: mission.id,
          type: mission.type,
          goal: mission.goal,
          status: mission.status,
          durationMs,
          agentParticipation: Array.from(this.completedNodeIds),
          evidenceCount: aggregated.evidence.length,
          outputs: aggregated,
          timestamp: new Date(),
        });
      }

      return aggregated;
    } catch (err: any) {
      unsubscribeList.forEach((unsub) => unsub());
      if (context.executionContext.cancellationToken.isCancelled) {
        mission.status = 'cancelled';
      } else {
        mission.status = 'failed';
      }
      throw err;
    }
  }

  private updateProgress(): void {
    if (this.graph && this.activeContext) {
      const total = this.graph.nodes.size;
      const completed = this.completedNodeIds.size;
      this.activeContext.progress = total > 0 ? completed / total : 0;
    }
  }

  pause(): void {
    if (this.orchestrator && this.activeContext) {
      this.orchestrator.pause();
      this.activeContext.mission.status = 'paused';
    }
  }

  resume(): void {
    if (this.orchestrator && this.activeContext) {
      this.orchestrator.resume();
      this.activeContext.mission.status = 'running';
    }
  }

  cancel(): void {
    if (this.activeContext) {
      this.activeContext.executionContext.cancellationToken.cancel('Mission cancelled by user');
      this.activeContext.mission.status = 'cancelled';
    }
  }

  checkpoint(): string {
    if (this.orchestrator) {
      return this.orchestrator.checkpoint();
    }
    throw new Error('No active execution to checkpoint');
  }

  loadCheckpoint(checkpointJson: string): void {
    this.pendingCheckpointJson = checkpointJson;
  }

  // Approval Gates support
  approveObjective(objectiveId: string): void {
    if (this.orchestrator) {
      this.orchestrator.approveNode(objectiveId);
    }
  }

  rejectObjective(objectiveId: string, reason: string): void {
    if (this.orchestrator) {
      this.orchestrator.rejectNode(objectiveId, reason);
    }
  }

  getPendingApprovals(): readonly string[] {
    if (this.orchestrator) {
      return this.orchestrator.getPendingApprovals();
    }
    return [];
  }

  getDashboardSnapshot(): any {
    if (!this.activeContext || !this.graph) {
      throw new Error('No active mission execution found');
    }
    return MissionDashboard.getSnapshot(this.activeContext.mission, this.graph, {
      runningNodeIds: this.runningNodeIds,
      completedNodeIds: this.completedNodeIds,
      failedNodeIds: this.failedNodeIds,
      retryCounts: this.retryCounts,
    });
  }
}
