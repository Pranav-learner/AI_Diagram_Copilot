import type { ExecutionContext } from '../execution/ExecutionContext';
import type { Mission } from './Mission';

export class MissionContext {
  readonly mission: Mission;
  readonly executionContext: ExecutionContext;

  constructor(mission: Mission, executionContext: ExecutionContext) {
    this.mission = mission;
    this.executionContext = executionContext;
  }

  get id(): string {
    return this.mission.id;
  }

  get status(): string {
    return this.mission.status;
  }

  set status(newStatus: any) {
    this.mission.status = newStatus;
  }

  get progress(): number {
    return this.mission.progress;
  }

  set progress(newProgress: number) {
    this.mission.progress = newProgress;
  }
}
