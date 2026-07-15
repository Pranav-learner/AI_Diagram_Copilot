import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class TestingAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'testing-agent',
    name: 'Test Generator',
    description: 'Generates unit, integration, and end-to-end tests for code modules.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['testing:generate', 'testing:run'],
    requiredContext: ['code'],
    supportedTools: ['repository:search'],
    permissions: ['read:code', 'write:code'],
    inputSchema: z.object({
      targetFile: z.string(),
    }),
    outputSchema: z.object({
      testFramework: z.string(),
      testCases: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          assertions: z.array(z.string()),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.0,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1200,
      expectedP95Ms: 3500,
    },
    supportedModels: ['claude-3-sonnet', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('repository:search', { query: 'Search test configurations' }, context.executionContext);

    return {
      data: {
        testFramework: 'Vitest',
        testCases: [
          {
            name: 'should create user correctly',
            description: 'asserts that valid user payloads return created status',
            assertions: ['expect(res.status).toBe(201)', 'expect(res.body.id).toBeDefined()'],
          },
        ],
      },
      evidence: [{ source: 'src/routes/__tests__/users.test.ts', origin: 'code', confidence: 0.97, method: 'static-analysis' }],
      confidence: 0.98,
      recommendations: ['Utilize factories for generating setup user data'],
    };
  }
}
