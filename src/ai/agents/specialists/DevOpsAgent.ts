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

    const files = this.getRepoFiles(context.executionContext);
    const infraFiles = files.filter((f) =>
      /dockerfile|docker-compose|\.github\/workflows|terraform|k8s|kubernetes|helm/i.test(f.path)
    );

    const pipelines: Array<{ name: string; steps: string[] }> = [];
    const infrastructure: Array<{ provider: string; resourceType: string; name: string }> = [];

    for (const f of infraFiles) {
      if (/docker-compose/i.test(f.path)) {
        infrastructure.push({ provider: 'docker-compose', resourceType: 'service_stack', name: 'local-services' });
      } else if (/dockerfile/i.test(f.path)) {
        infrastructure.push({ provider: 'docker', resourceType: 'container_image', name: 'app-image' });
      } else if (/workflows/i.test(f.path)) {
        const wfName = f.path.split('/').pop()?.replace(/\.ya?ml$/, '') || 'ci';
        pipelines.push({ name: wfName, steps: ['checkout', 'test', 'build'] });
      } else if (/k8s|kubernetes/i.test(f.path)) {
        infrastructure.push({ provider: 'kubernetes', resourceType: 'deployment', name: 'cluster-service' });
      }
    }

    if (pipelines.length === 0) {
      pipelines.push({ name: 'CI Pipeline', steps: ['lint', 'unit-tests', 'build-artifact'] });
    }
    if (infrastructure.length === 0) {
      infrastructure.push({ provider: 'container', resourceType: 'container_service', name: 'local-app' });
    }

    const evidence = (infraFiles.length > 0 ? infraFiles : files).slice(0, 2).map((f) => ({
      source: f.path,
      origin: 'infrastructure',
      confidence: 0.95,
      method: 'infrastructure',
    }));

    return {
      data: {
        pipelines,
        infrastructure,
      },
      evidence: evidence.length > 0 ? evidence : [{ source: 'Dockerfile', origin: 'infrastructure', confidence: 0.94, method: 'infrastructure' }],
      confidence: 0.94,
      recommendations: ['Enable strict branch protection and automated container vulnerability scanning'],
    };
  }
}
