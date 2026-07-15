import type { ExecutionResult } from './ExecutionUnit';

export type ExecutionStatus =
  | 'Pending'
  | 'Running'
  | 'Waiting'
  | 'Paused'
  | 'Retrying'
  | 'Succeeded'
  | 'Failed'
  | 'Cancelled';

export interface ExecutionState {
  readonly id: string;
  readonly unitId: string;
  readonly status: ExecutionStatus;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly result?: ExecutionResult;
  readonly retries: number;
  readonly progress: number;
  readonly lastMessage?: string;
}

export interface ExecutionStateStore {
  get(id: string): Promise<ExecutionState | undefined>;
  set(state: ExecutionState): Promise<void>;
  list(): Promise<readonly ExecutionState[]>;
  delete(id: string): Promise<void>;
}

export class InMemoryExecutionStateStore implements ExecutionStateStore {
  private readonly states = new Map<string, ExecutionState>();

  async get(id: string): Promise<ExecutionState | undefined> {
    return this.states.get(id);
  }

  async set(state: ExecutionState): Promise<void> {
    this.states.set(state.id, state);
  }

  async list(): Promise<readonly ExecutionState[]> {
    return Array.from(this.states.values());
  }

  async delete(id: string): Promise<void> {
    this.states.delete(id);
  }
}
