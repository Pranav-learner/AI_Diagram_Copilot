import type { ExecutionResult } from '../execution/ExecutionUnit';

export type ExecutionEventType =
  | 'execution:started'
  | 'execution:progress'
  | 'execution:completed'
  | 'execution:failed'
  | 'execution:cancelled'
  | 'tool:invoked'
  | 'approval:requested';

export interface BaseExecutionEvent {
  readonly type: ExecutionEventType;
  readonly timestamp: Date;
  readonly traceId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly unitId: string;
}

export interface ExecutionStartedEvent extends BaseExecutionEvent {
  readonly type: 'execution:started';
  readonly userGoal: string;
}

export interface ExecutionProgressEvent extends BaseExecutionEvent {
  readonly type: 'execution:progress';
  readonly progress: number;
  readonly message?: string;
}

export interface ExecutionCompletedEvent extends BaseExecutionEvent {
  readonly type: 'execution:completed';
  readonly result: ExecutionResult;
}

export interface ExecutionFailedEvent extends BaseExecutionEvent {
  readonly type: 'execution:failed';
  readonly error: Error;
}

export interface ExecutionCancelledEvent extends BaseExecutionEvent {
  readonly type: 'execution:cancelled';
  readonly reason?: string;
}

export interface ToolInvokedEvent extends BaseExecutionEvent {
  readonly type: 'tool:invoked';
  readonly toolId: string;
  readonly args: any;
  readonly result?: any;
  readonly error?: Error;
  readonly durationMs: number;
}

export interface ApprovalRequestedEvent extends BaseExecutionEvent {
  readonly type: 'approval:requested';
  readonly message: string;
  readonly permissionsRequired?: readonly string[];
}

export type ExecutionEvent =
  | ExecutionStartedEvent
  | ExecutionProgressEvent
  | ExecutionCompletedEvent
  | ExecutionFailedEvent
  | ExecutionCancelledEvent
  | ToolInvokedEvent
  | ApprovalRequestedEvent;
