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

    await this.invokeTool('repository:search', { query: 'Search git diffs' }, context.executionContext);

    return {
      data: {
        approved: true,
        comments: [
          {
            file: 'src/utils.ts',
            line: 23,
            comment: 'Consider renaming variable userVal to user for clarity',
            severity: 'suggestion',
          },
        ],
      },
      evidence: [{ source: 'src/utils.ts', origin: 'code', confidence: 0.94, method: 'static-analysis' }],
      confidence: 0.94,
      recommendations: [],
    };
  }
}
