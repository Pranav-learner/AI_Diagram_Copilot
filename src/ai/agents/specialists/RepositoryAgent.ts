import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class RepositoryAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'repository-agent',
    name: 'Repository Searcher',
    description: 'Searches codebase, files, and classes to locate code patterns and definitions.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['repository:search', 'repository:analyze'],
    requiredContext: [],
    supportedTools: ['repository:search'],
    permissions: ['read:code'],
    inputSchema: z.object({
      query: z.string(),
    }),
    outputSchema: z.object({
      matchedFiles: z.array(z.string()),
      matchedCodeSnippets: z.array(
        z.object({
          file: z.string(),
          line: z.number(),
          snippet: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.0,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 800,
      expectedP95Ms: 2500,
    },
    supportedModels: ['claude-3-haiku', 'gemini-1.5-flash'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('repository:search', { query: 'Search query' }, context.executionContext);

    return {
      data: {
        matchedFiles: ['src/index.ts', 'src/utils.ts'],
        matchedCodeSnippets: [
          { file: 'src/index.ts', line: 10, snippet: 'export const main = () => {}' },
        ],
      },
      evidence: [{ source: 'src/index.ts', origin: 'code', confidence: 0.99, method: 'static-analysis' }],
      confidence: 0.99,
      recommendations: [],
    };
  }
}
