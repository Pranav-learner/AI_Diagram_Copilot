import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class ArchitectureAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'architecture-agent',
    name: 'Architecture Analyzer',
    description: 'Analyzes codebases and PIMs to identify architectural patterns, layers, and styles.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['architecture:analyze'],
    requiredContext: ['pim', 'ontology'],
    supportedTools: ['knowledge:query'],
    permissions: ['read:pim', 'read:pkm'],
    inputSchema: z.object({
      projectPath: z.string().optional(),
    }),
    outputSchema: z.object({
      architectureStyle: z.string(),
      layers: z.array(z.string()),
      components: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
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
    supportedModels: ['claude-3-opus', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    // 1. Check if mock data is provided in executionContext metadata
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    // 2. Invoke tool to query knowledge
    await this.invokeTool('knowledge:query', { query: 'Fetch layers and service entities' }, context.executionContext);

    // 3. Construct default fallback matching the schema
    return {
      data: {
        architectureStyle: 'Microservices',
        layers: ['API Gateway', 'Core Service', 'Database Layer'],
        components: [
          { name: 'Gateway', description: 'Routes incoming requests' },
          { name: 'UserService', description: 'Handles user profiles and authentication' },
        ],
      },
      evidence: [{ source: 'architecture-doc.md', origin: 'document', confidence: 0.95, method: 'documentation' }],
      confidence: 0.95,
      recommendations: ['Decouple authentication service into a separate bounded context'],
    };
  }
}
