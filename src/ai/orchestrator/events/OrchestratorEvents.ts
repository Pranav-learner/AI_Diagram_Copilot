export type OrchestratorEventType =
  | 'workflow:started'
  | 'node:started'
  | 'node:completed'
  | 'node:failed'
  | 'node:retry'
  | 'approval:requested'
  | 'workflow:completed';

export interface BaseOrchestratorEvent {
  readonly type: OrchestratorEventType;
  readonly timestamp: Date;
  readonly taskId: string;
  readonly sessionId: string;
}

export interface WorkflowStartedEvent extends BaseOrchestratorEvent {
  readonly type: 'workflow:started';
  readonly goal: string;
}

export interface NodeStartedEvent extends BaseOrchestratorEvent {
  readonly type: 'node:started';
  readonly nodeId: string;
  readonly nodeName: string;
}

export interface NodeCompletedEvent extends BaseOrchestratorEvent {
  readonly type: 'node:completed';
  readonly nodeId: string;
  readonly result: any;
}

export interface NodeFailedEvent extends BaseOrchestratorEvent {
  readonly type: 'node:failed';
  readonly nodeId: string;
  readonly error: Error;
}

export interface NodeRetryEvent extends BaseOrchestratorEvent {
  readonly type: 'node:retry';
  readonly nodeId: string;
  readonly attempt: number;
  readonly error: Error;
}

export interface ApprovalRequestedEvent extends BaseOrchestratorEvent {
  readonly type: 'approval:requested';
  readonly nodeId: string;
  readonly message: string;
  readonly approve: () => void;
  readonly reject: (reason: string) => void;
}

export interface WorkflowCompletedEvent extends BaseOrchestratorEvent {
  readonly type: 'workflow:completed';
  readonly success: boolean;
  readonly results: ReadonlyMap<string, any>;
  readonly errors: ReadonlyMap<string, Error>;
}

export type OrchestratorEvent =
  | WorkflowStartedEvent
  | NodeStartedEvent
  | NodeCompletedEvent
  | NodeFailedEvent
  | NodeRetryEvent
  | ApprovalRequestedEvent
  | WorkflowCompletedEvent;
