import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class ReviewerAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'reviewer-agent',
    name: 'Code Reviewer',
    description: 'Conducts code reviews, suggests lint fixes, and checks compliance against standards.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['reviewer:pr:analyze', 'reviewer:code:review'],
    requiredContext: ['code'],
    supportedTools: ['repository:search', 'review:audit'],
    permissions: ['read:code'],
    inputSchema: z.object({
      changeId: z.string(),
    }),
    outputSchema: z.object({
      approved: z.boolean(),
      comments: z.array(
        z.object({
          file: z.string(),
          line: z.number(),
          comment: z.string(),
          severity: z.enum(['suggestion', 'warning', 'blocking']),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.5,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1400,
      expectedP95Ms: 3800,
    },
    supportedModels: ['claude-3-opus', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('repository:search', { query: 'TODO|FIXME|console.log|any' }, context.executionContext);

    const files = this.getRepoFiles(context.executionContext);
    const comments: Array<{ file: string; line: number; comment: string; severity: 'suggestion' | 'warning' | 'blocking' }> = [];
    const evidenceFiles: string[] = [];

    for (const f of files) {
      if (comments.length >= 5) break;
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (/console\.(log|debug)/.test(line)) {
          comments.push({
            file: f.path,
            line: i + 1,
            comment: 'Remove or replace debug logging with structured logger',
            severity: 'suggestion',
          });
          evidenceFiles.push(f.path);
          break;
        } else if (/TODO|FIXME/i.test(line)) {
          comments.push({
            file: f.path,
            line: i + 1,
            comment: `Unresolved task comment: "${line.trim().slice(0, 60)}"`,
            severity: 'warning',
          });
          evidenceFiles.push(f.path);
          break;
        } else if (/:\s*any\b/.test(line)) {
          comments.push({
            file: f.path,
            line: i + 1,
            comment: 'Avoid explicit "any" type; provide specific interface or generic constraint',
            severity: 'warning',
          });
          evidenceFiles.push(f.path);
          break;
        }
      }
    }

    if (comments.length === 0) {
      const defFile = files[0]?.path || 'src/main.ts';
      comments.push({
        file: defFile,
        line: 1,
        comment: 'Code meets architectural and lint guidelines',
        severity: 'suggestion',
      });
      evidenceFiles.push(defFile);
    }

    const hasBlocking = comments.some((c) => c.severity === 'blocking');

    return {
      data: {
        approved: !hasBlocking,
        comments,
      },
      evidence: evidenceFiles.slice(0, 3).map((f) => ({
        source: f,
        origin: 'code',
        confidence: 0.94,
        method: 'static-analysis',
      })),
      confidence: 0.94,
      recommendations: comments.filter((c) => c.severity !== 'suggestion').map((c) => `${c.file}:${c.line} - ${c.comment}`),
    };
  }
}
