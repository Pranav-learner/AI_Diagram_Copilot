import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class BackendAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'backend-agent',
    name: 'Backend Developer',
    description: 'Generates backend microservices, handlers, APIs, controllers, and domain models.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['backend:codegen', 'backend:api:generate'],
    requiredContext: ['code'],
    supportedTools: ['repository:search'],
    permissions: ['read:code', 'write:code'],
    inputSchema: z.object({
      serviceName: z.string(),
    }),
    outputSchema: z.object({
      language: z.string(),
      framework: z.string(),
      endpoints: z.array(
        z.object({
          method: z.string(),
          path: z.string(),
          requestSchema: z.string(),
          responseSchema: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.5,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1600,
      expectedP95Ms: 4200,
    },
    supportedModels: ['claude-3-opus', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('repository:search', { query: 'Search controller codes' }, context.executionContext);

    return {
      data: {
        language: 'TypeScript',
        framework: 'Express',
        endpoints: [
          { method: 'POST', path: '/users', requestSchema: 'UserCreateDto', responseSchema: 'UserDto' },
        ],
      },
      evidence: [{ source: 'src/routes/users.ts', origin: 'code', confidence: 0.96, method: 'static-analysis' }],
      confidence: 0.96,
      recommendations: ['Enforce authentication middleware on POST /users endpoint'],
    };
  }
}
