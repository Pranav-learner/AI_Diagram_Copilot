import type { ExecutionGraph } from './ExecutionGraph';

export class ExecutionValidator {
  static validate(graph: ExecutionGraph): void {
    if (graph.nodes.size === 0) {
      throw new Error('Execution graph is empty');
    }

    // Verify all nodes referenced in edges exist
    for (const edge of graph.edges) {
      if (!graph.nodes.has(edge.from)) {
        throw new Error(`Edge refers to non-existent source node: "${edge.from}"`);
      }
      if (!graph.nodes.has(edge.to)) {
        throw new Error(`Edge refers to non-existent target node: "${edge.to}"`);
      }
    }

    // Verify all dependencies listed on nodes exist
    for (const node of graph.nodes.values()) {
      for (const dep of node.dependencies) {
        if (!graph.nodes.has(dep)) {
          throw new Error(`Node "${node.id}" depends on non-existent node: "${dep}"`);
        }
      }
    }

    // Cycle detection using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const checkCycle = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) {
        return true; // Cycle detected
      }
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recStack.add(nodeId);

      // Node's children: either outgoing edges or nodes that explicitly specify this node in dependencies
      const children = graph.edges
        .filter((e) => e.from === nodeId)
        .map((e) => e.to)
        .concat(
          Array.from(graph.nodes.values())
            .filter((n) => n.dependencies.includes(nodeId))
            .map((n) => n.id)
        );

      const uniqueChildren = Array.from(new Set(children));

      for (const child of uniqueChildren) {
        if (checkCycle(child)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes.keys()) {
      if (checkCycle(node)) {
        throw new Error('Cycle detected in execution graph');
      }
    }

    // Verify that at least one start node exists
    const startNodes = Array.from(graph.nodes.values()).filter((n) => {
      const hasIncomingEdges = graph.edges.some((e) => e.to === n.id);
      return n.dependencies.length === 0 && !hasIncomingEdges;
    });

    if (startNodes.length === 0) {
      throw new Error('No entry points found in execution graph (graph is cyclic or fully blocked)');
    }
  }
}
