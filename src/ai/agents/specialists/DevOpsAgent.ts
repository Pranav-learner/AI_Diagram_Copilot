import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class DevOpsAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'devops-agent',
    name: 'DevOps & Infra Engineer',
    description: 'Analyzes environment architectures, infrastructure scripts (Terraform/Compose), and CI/CD pipelines.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['devops:pipeline:analyze', 'devops:infra:generate'],
    requiredContext: ['pim'],
    supportedTools: ['knowledge:query'],
    permissions: ['read:pim'],
    inputSchema: z.object({
      targetEnv: z.string().optional(),
    }),
    outputSchema: z.object({
      pipelines: z.array(
        z.object({
          name: z.string(),
          steps: z.array(z.string()),
        })
      ),
      infrastructure: z.array(
        z.object({
          provider: z.string(),
          resourceType: z.string(),
          name: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.0,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1300,
      expectedP95Ms: 3600,
    },
    supportedModels: ['claude-3-sonnet', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('knowledge:query', { query: 'Query deploy files' }, context.executionContext);

    return {
      data: {
        pipelines: [
          { name: 'CI Build', steps: ['lint', 'test', 'build-docker'] },
        ],
        infrastructure: [
          { provider: 'aws', resourceType: 'ecs_service', name: 'api-service' },
        ],
      },
      evidence: [{ source: 'docker-compose.yml', origin: 'infrastructure', confidence: 0.94, method: 'infrastructure' }],
      confidence: 0.94,
      recommendations: ['Enable branch protections for release deployments'],
    };
  }
}
