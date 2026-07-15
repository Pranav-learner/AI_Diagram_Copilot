export interface CheckpointState {
  readonly taskId: string;
  readonly sessionId: string;
  readonly nodeStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>;
  readonly nodeResults: Record<string, any>;
  readonly nodeErrors: Record<string, { message: string; name: string }>;
  readonly contextMetadata: Record<string, any>;
  readonly timestamp: number;
}

export class CheckpointManager {
  static serialize(
    taskId: string,
    sessionId: string,
    nodeStatuses: ReadonlyMap<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>,
    nodeResults: ReadonlyMap<string, any>,
    nodeErrors: ReadonlyMap<string, Error>,
    contextMetadata: Record<string, any>
  ): string {
    const serializedErrors: Record<string, { message: string; name: string }> = {};
    for (const [key, value] of nodeErrors.entries()) {
      serializedErrors[key] = {
        message: value.message,
        name: value.name || 'Error',
      };
    }

    const state: CheckpointState = {
      taskId,
      sessionId,
      nodeStatuses: Object.fromEntries(nodeStatuses),
      nodeResults: Object.fromEntries(nodeResults),
      nodeErrors: serializedErrors,
      contextMetadata,
      timestamp: Date.now(),
    };

    return JSON.stringify(state);
  }

  static deserialize(checkpointJson: string): CheckpointState {
    const parsed = JSON.parse(checkpointJson);
    if (!parsed.taskId || !parsed.sessionId || !parsed.nodeStatuses) {
      throw new Error('Invalid checkpoint data format');
    }
    return parsed as CheckpointState;
  }
}
