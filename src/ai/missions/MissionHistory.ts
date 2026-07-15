import type { Mission } from './Mission';

export interface MissionHistoryRecord {
  readonly missionId: string;
  readonly type: string;
  readonly goal: string;
  readonly status: string;
  readonly durationMs: number;
  readonly agentParticipation: readonly string[];
  readonly evidenceCount: number;
  readonly outputs: any;
  readonly timestamp: Date;
}

export interface MissionHistoryStore {
  saveRecord(record: MissionHistoryRecord): Promise<void>;
  getRecord(missionId: string): Promise<MissionHistoryRecord | undefined>;
  listRecords(): Promise<readonly MissionHistoryRecord[]>;
}

export class InMemoryMissionHistoryStore implements MissionHistoryStore {
  private readonly records = new Map<string, MissionHistoryRecord>();

  async saveRecord(record: MissionHistoryRecord): Promise<void> {
    this.records.set(record.missionId, record);
  }

  async getRecord(missionId: string): Promise<MissionHistoryRecord | undefined> {
    return this.records.get(missionId);
  }

  async listRecords(): Promise<readonly MissionHistoryRecord[]> {
    return Array.from(this.records.values());
  }
}
