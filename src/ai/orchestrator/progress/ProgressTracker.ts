import type { ExecutionGraph } from '../../execution-graph/ExecutionGraph';

export class ProgressTracker {
  private readonly graph: ExecutionGraph;
  private readonly startTime: number;
  private readonly nodeStartTimes = new Map<string, number>();
  private readonly nodeEndTimes = new Map<string, number>();

  constructor(graph: ExecutionGraph) {
    this.graph = graph;
    this.startTime = Date.now();
  }

  recordNodeStart(nodeId: string): void {
    this.nodeStartTimes.set(nodeId, Date.now());
  }

  recordNodeEnd(nodeId: string): void {
    this.nodeEndTimes.set(nodeId, Date.now());
  }

  getProgress(
    nodeStatuses: ReadonlyMap<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>
  ) {
    const total = this.graph.nodes.size;
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    let skipped = 0;

    for (const status of nodeStatuses.values()) {
      switch (status) {
        case 'pending':
          pending++;
          break;
        case 'running':
          running++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
        case 'skipped':
          skipped++;
          break;
      }
    }

    const finished = completed + skipped + failed;
    const progressPercent = total > 0 ? Math.round((finished / total) * 100) : 100;

    let totalDuration = 0;
    let completedDurationsCount = 0;

    for (const [nodeId, endTime] of this.nodeEndTimes.entries()) {
      const startTime = this.nodeStartTimes.get(nodeId);
      if (startTime !== undefined) {
        totalDuration += endTime - startTime;
        completedDurationsCount++;
      }
    }

    const averageDurationMs = completedDurationsCount > 0 ? totalDuration / completedDurationsCount : 1000;
    const estimatedRemainingMs = (pending + running) * averageDurationMs;

    return {
      progressPercent,
      nodeCounts: {
        total,
        pending,
        running,
        completed,
        failed,
        skipped,
      },
      elapsedMs: Date.now() - this.startTime,
      estimatedRemainingMs: Math.max(0, estimatedRemainingMs),
    };
  }
}
