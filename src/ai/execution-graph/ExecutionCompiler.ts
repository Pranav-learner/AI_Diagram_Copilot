import type { SharedPlanningModel } from './SharedPlanningModel';
import type { ExecutionGraph } from './ExecutionGraph';
import type { ExecutionNode } from './ExecutionNode';
import type { ExecutionEdge } from './ExecutionEdge';
import { ExecutionValidator } from './ExecutionValidator';

export class ExecutionCompiler {
  static compile(spm: SharedPlanningModel): ExecutionGraph {
    const nodes = new Map<string, ExecutionNode>();
    const edges: ExecutionEdge[] = [];

    // Map SpmTasks to ExecutionNodes
    for (const task of spm.tasks) {
      const node: ExecutionNode = {
        id: task.id,
        name: task.name,
        type: 'task',
        unitId: task.unitId,
        dependencies: [...task.dependencies],
        retryPolicy: task.retryPolicy,
        failurePolicy: task.failurePolicy,
        timeoutMs: task.timeoutMs,
        approvalGate: task.approvalGate,
        resourceLimits: task.resourceLimits,
        metadata: task.metadata,
      };
      nodes.set(task.id, node);

      // Create explicit dependency edges
      for (const depId of task.dependencies) {
        edges.push({
          from: depId,
          to: task.id,
        });
      }
    }

    const graph: ExecutionGraph = {
      taskId: spm.taskId,
      sessionId: spm.sessionId,
      goal: spm.goal,
      nodes,
      edges,
      metadata: spm.metadata,
    };

    // Ensure the compiled graph structure is valid before returning it
    ExecutionValidator.validate(graph);

    return graph;
  }
}
