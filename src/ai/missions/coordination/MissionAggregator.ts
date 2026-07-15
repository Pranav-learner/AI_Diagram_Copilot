import type { Mission } from '../Mission';

export interface MissionAggregatedOutput {
  readonly missionId: string;
  readonly type: string;
  readonly success: boolean;
  readonly diagrams: readonly any[];
  readonly reports: readonly any[];
  readonly reviews: readonly any[];
  readonly recommendations: readonly string[];
  readonly evidence: readonly any[];
  readonly artifacts: readonly string[];
  readonly durationMs: number;
}

export class MissionAggregator {
  static aggregate(
    mission: Mission,
    nodeResults: ReadonlyMap<string, any>,
    durationMs: number
  ): MissionAggregatedOutput {
    const diagrams: any[] = [];
    const reports: any[] = [];
    const reviews: any[] = [];
    const recommendations: string[] = [];
    const evidenceSet = new Set<string>();
    const evidence: any[] = [];
    const artifacts: string[] = [...mission.artifacts];

    for (const [nodeId, result] of nodeResults.entries()) {
      if (result) {
        const agentOutput = result;

        if (Array.isArray(agentOutput.recommendations)) {
          recommendations.push(...agentOutput.recommendations);
        }

        if (Array.isArray(agentOutput.evidence)) {
          for (const ev of agentOutput.evidence) {
            const evKey = `${ev.source || ''}:${ev.origin || ''}:${ev.line || ''}`;
            if (!evidenceSet.has(evKey)) {
              evidenceSet.add(evKey);
              evidence.push(ev);
            }
          }
        }

        const data = agentOutput.data;
        if (data) {
          // Route and segment by typical agent ID
          if (nodeId.includes('diagram')) {
            diagrams.push(data);
          } else if (nodeId.includes('doc') || nodeId.includes('documentation') || nodeId.includes('repo')) {
            reports.push(data);
          } else if (nodeId.includes('reviewer') || nodeId.includes('review') || nodeId.includes('security')) {
            reviews.push(data);
          } else {
            reports.push({ nodeId, ...data });
          }
        }
      }
    }

    return {
      missionId: mission.id,
      type: mission.type,
      success: mission.status === 'completed',
      diagrams,
      reports,
      reviews,
      recommendations: Array.from(new Set(recommendations)),
      evidence,
      artifacts,
      durationMs,
    };
  }
}
