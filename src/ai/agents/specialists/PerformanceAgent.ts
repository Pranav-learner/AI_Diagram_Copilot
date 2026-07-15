import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class PerformanceAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'performance-agent',
    name: 'Performance Profiler',
    description: 'Profiles execution and queries codebase to find performance bottlenecks and CPU/memory hotspots.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['performance:profile', 'performance:optimize'],
    requiredContext: ['code'],
    supportedTools: ['repository:search'],
    permissions: ['read:code'],
    inputSchema: z.object({
      scope: z.string().optional(),
    }),
    outputSchema: z.object({
      bottlenecks: z.array(
        z.object({
          description: z.string(),
          location: z.string(),
          impact: z.string(),
          recommendation: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.0,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1400,
      expectedP95Ms: 3800,
    },
    supportedModels: ['claude-3-sonnet', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('repository:search', { query: 'Profile code loops' }, context.executionContext);

    return {
      data: {
        bottlenecks: [
          {
            description: 'Nested loop O(N^2) complexity in dataset processing',
            location: 'src/utils.ts:45',
            impact: 'High CPU utilization with large inputs',
            recommendation: 'Refactor using Map lookup for O(N) complexity',
          },
        ],
      },
      evidence: [{ source: 'src/utils.ts', origin: 'code', confidence: 0.88, method: 'static-analysis' }],
      confidence: 0.9,
      recommendations: ['Add benchmarks for dataset processing'],
    };
  }
}
