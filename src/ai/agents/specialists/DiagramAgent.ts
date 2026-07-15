import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class DiagramAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'diagram-agent',
    name: 'Diagram Generator',
    description: 'Generates and edits visual diagram layouts and architectures.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['diagram:generate', 'diagram:edit'],
    requiredContext: ['pim'],
    supportedTools: ['diagram:generate'],
    permissions: ['diagram:generate', 'diagram:modify'],
    inputSchema: z.object({
      focusArea: z.string().optional(),
    }),
    outputSchema: z.object({
      diagramId: z.string(),
      elements: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          label: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.5,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1500,
      expectedP95Ms: 4000,
    },
    supportedModels: ['claude-3-opus', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    // Call tool
    await this.invokeTool('diagram:generate', { prompt: 'Generate layout' }, context.executionContext);

    return {
      data: {
        diagramId: 'diag_001',
        elements: [
          { id: 'el_1', type: 'rectangle', label: 'User Client' },
          { id: 'el_2', type: 'rectangle', label: 'API Gateway' },
        ],
      },
      evidence: [{ source: 'system-layout.json', origin: 'diagram', confidence: 0.98, method: 'diagram' }],
      confidence: 0.98,
      recommendations: ['Group database elements inside a storage boundary'],
    };
  }
}
