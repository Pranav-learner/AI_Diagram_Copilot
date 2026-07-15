import type { ExecutionNode } from '../execution-graph/ExecutionNode';

export class ApprovalManager {
  private readonly pendingApprovals = new Map<
    string,
    { approve: () => void; reject: (reason: string) => void }
  >();

  requiresApproval(node: ExecutionNode): boolean {
    return node.approvalGate?.required ?? false;
  }

  requestApproval(
    node: ExecutionNode,
    onApprove: () => void,
    onReject: (reason: string) => void
  ): void {
    this.pendingApprovals.set(node.id, {
      approve: () => {
        this.pendingApprovals.delete(node.id);
        onApprove();
      },
      reject: (reason: string) => {
        this.pendingApprovals.delete(node.id);
        onReject(reason);
      },
    });
  }

  approve(nodeId: string): void {
    const handler = this.pendingApprovals.get(nodeId);
    if (!handler) {
      throw new Error(`No pending approval request found for node: "${nodeId}"`);
    }
    handler.approve();
  }

  reject(nodeId: string, reason: string): void {
    const handler = this.pendingApprovals.get(nodeId);
    if (!handler) {
      throw new Error(`No pending approval request found for node: "${nodeId}"`);
    }
    handler.reject(reason);
  }

  getPendingNodeIds(): readonly string[] {
    return Array.from(this.pendingApprovals.keys());
  }

  isPending(nodeId: string): boolean {
    return this.pendingApprovals.has(nodeId);
  }
}
