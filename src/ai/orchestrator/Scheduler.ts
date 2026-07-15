import type { ExecutionGraph } from '../execution-graph/ExecutionGraph';
import type { ExecutionNode } from '../execution-graph/ExecutionNode';
import type { ExecutionEdge } from '../execution-graph/ExecutionEdge';

export class Scheduler {
  private readonly graph: ExecutionGraph;
  private readonly nodeStatuses = new Map<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>();
  private readonly incomingEdges = new Map<string, ExecutionEdge[]>();
  private readonly outgoingEdges = new Map<string, ExecutionEdge[]>();

  constructor(graph: ExecutionGraph) {
    this.graph = graph;

    // Initialize tracking containers
    for (const nodeId of graph.nodes.keys()) {
      this.nodeStatuses.set(nodeId, 'pending');
      this.incomingEdges.set(nodeId, []);
      this.outgoingEdges.set(nodeId, []);
    }

    for (const edge of graph.edges) {
      this.incomingEdges.get(edge.to)!.push(edge);
      this.outgoingEdges.get(edge.from)!.push(edge);
    }
  }

  getStatus(nodeId: string): 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | undefined {
    return this.nodeStatuses.get(nodeId);
  }

  setStatus(nodeId: string, status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'): void {
    this.nodeStatuses.set(nodeId, status);
  }

  /**
   * Retrieves all nodes that are currently pending and have all their dependencies met.
   * Evaluates conditional transition predicates and propagates skips downstream.
   */
  getReadyNodes(context: any, nodeResults: ReadonlyMap<string, any>): readonly ExecutionNode[] {
    const readyNodes: ExecutionNode[] = [];

    // Propagate skips transitively for nodes whose upstream branches are resolved
    let changed = true;
    while (changed) {
      changed = false;
      for (const [nodeId, status] of this.nodeStatuses.entries()) {
        if (status !== 'pending') continue;

        const node = this.graph.nodes.get(nodeId)!;
        const explicitDeps = node.dependencies;
        const edgeDeps = this.incomingEdges.get(nodeId)!.map((e) => e.from);
        const allDeps = Array.from(new Set([...explicitDeps, ...edgeDeps]));

        if (allDeps.length === 0) {
          continue;
        }

        const allFinished = allDeps.every((depId) => {
          const depStatus = this.nodeStatuses.get(depId);
          return depStatus === 'completed' || depStatus === 'skipped' || depStatus === 'failed';
        });

        if (allFinished) {
          // If any upstream dependency has failed, we must skip this downstream node
          const hasFailedDep = allDeps.some((depId) => this.nodeStatuses.get(depId) === 'failed');
          if (hasFailedDep) {
            this.nodeStatuses.set(nodeId, 'skipped');
            changed = true;
            continue;
          }

          // Evaluate conditions on incoming edges
          const incomingEdges = this.incomingEdges.get(nodeId)!;
          if (incomingEdges.length > 0) {
            let hasTruePath = false;
            let hasIncomingCompleted = false;

            for (const edge of incomingEdges) {
              const fromStatus = this.nodeStatuses.get(edge.from);
              if (fromStatus === 'completed') {
                hasIncomingCompleted = true;
                const conditionMet = edge.condition ? edge.condition(context, nodeResults) : true;
                if (conditionMet) {
                  hasTruePath = true;
                }
              }
            }

            // Skip node if no incoming completed dependency satisfied its transition condition
            if (!hasTruePath && (hasIncomingCompleted || incomingEdges.every((e) => this.nodeStatuses.get(e.from) === 'skipped'))) {
              this.nodeStatuses.set(nodeId, 'skipped');
              changed = true;
            }
          } else {
            // If all explicit dependency nodes were skipped, skip this node too
            const allDepsSkipped = allDeps.every((depId) => this.nodeStatuses.get(depId) === 'skipped');
            if (allDepsSkipped) {
              this.nodeStatuses.set(nodeId, 'skipped');
              changed = true;
            }
          }
        }
      }
    }

    // Identify nodes that are ready to run
    for (const [nodeId, status] of this.nodeStatuses.entries()) {
      if (status !== 'pending') continue;

      const node = this.graph.nodes.get(nodeId)!;
      const explicitDeps = node.dependencies;
      const edgeDeps = this.incomingEdges.get(nodeId)!.map((e) => e.from);
      const allDeps = Array.from(new Set([...explicitDeps, ...edgeDeps]));

      if (allDeps.length === 0) {
        readyNodes.push(node);
        continue;
      }

      const isReady = allDeps.every((depId) => {
        const depStatus = this.nodeStatuses.get(depId);
        return depStatus === 'completed' || depStatus === 'skipped';
      });

      if (isReady) {
        readyNodes.push(node);
      }
    }

    return readyNodes;
  }

  isWorkflowComplete(): boolean {
    return Array.from(this.nodeStatuses.values()).every(
      (status) => status === 'completed' || status === 'failed' || status === 'skipped'
    );
  }

  hasFailures(): boolean {
    return Array.from(this.nodeStatuses.values()).some((status) => status === 'failed');
  }

  getNodeStatuses(): ReadonlyMap<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'> {
    return this.nodeStatuses;
  }
}
