import type { Mission } from './Mission';
import type { ExecutionGraph } from '../execution-graph/ExecutionGraph';

export interface DashboardSnapshot {
  readonly missionId: string;
  readonly status: string;
  readonly progress: number;
  readonly runningAgents: readonly string[];
  readonly completedTasks: readonly string[];
  readonly pendingTasks: readonly string[];
  readonly failuresCount: number;
  readonly retriesCount: number;
  readonly estimatedCompletionMs: number;
  readonly summary: string;
  readonly graphNodesCount: number;
  readonly graphEdgesCount: number;
}

export class MissionDashboard {
  static getSnapshot(
    mission: Mission,
    graph: ExecutionGraph,
    orchestratorState?: {
      readonly runningNodeIds: ReadonlySet<string>;
      readonly completedNodeIds: ReadonlySet<string>;
      readonly failedNodeIds: ReadonlySet<string>;
      readonly retryCounts: ReadonlyMap<string, number>;
      readonly averageNodeExecutionTimeMs?: number;
    }
  ): DashboardSnapshot {
    const runningAgents = orchestratorState ? [...orchestratorState.runningNodeIds] : [];
    const completedTasks = orchestratorState ? [...orchestratorState.completedNodeIds] : [];
    const failedTasks = orchestratorState ? [...orchestratorState.failedNodeIds] : [];

    const allNodeIds = Array.from(graph.nodes.keys());
    const pendingTasks = allNodeIds.filter(
      (id) => !runningAgents.includes(id) && !completedTasks.includes(id) && !failedTasks.includes(id)
    );

    let retriesCount = 0;
    if (orchestratorState?.retryCounts) {
      for (const count of orchestratorState.retryCounts.values()) {
        retriesCount += count;
      }
    }

    const avgLatency = orchestratorState?.averageNodeExecutionTimeMs ?? 1500;
    const remainingTasksCount = pendingTasks.length + runningAgents.length;
    const estimatedCompletionMs = remainingTasksCount * avgLatency;

    const totalTasks = allNodeIds.length;
    const progress = totalTasks > 0 ? completedTasks.length / totalTasks : 0.0;

    const summary = `Mission ${mission.id} (${mission.type}) is currently ${mission.status}. ` +
      `${completedTasks.length}/${totalTasks} objectives achieved with ${retriesCount} retries.`;

    return {
      missionId: mission.id,
      status: mission.status,
      progress,
      runningAgents,
      completedTasks,
      pendingTasks,
      failuresCount: failedTasks.length,
      retriesCount,
      estimatedCompletionMs,
      summary,
      graphNodesCount: graph.nodes.size,
      graphEdgesCount: graph.edges.length,
    };
  }
}
