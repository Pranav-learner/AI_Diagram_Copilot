import type { ExecutionNode } from './ExecutionNode';
import type { ExecutionEdge } from './ExecutionEdge';

export interface ExecutionGraph {
  readonly taskId: string;
  readonly sessionId: string;
  readonly goal: string;
  readonly nodes: ReadonlyMap<string, ExecutionNode>;
  readonly edges: readonly ExecutionEdge[];
  readonly metadata?: Readonly<Record<string, any>>;
}
