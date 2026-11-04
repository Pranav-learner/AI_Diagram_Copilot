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

    const entities = this.getEntities(context.executionContext);
    const files = this.getRepoFiles(context.executionContext);

    const elements: Array<{ id: string; type: string; label: string }> = [];

    if (entities.length > 0) {
      for (let i = 0; i < Math.min(entities.length, 12); i++) {
        const ent = entities[i];
        elements.push({
          id: ent.id || `el_${i + 1}`,
          type: 'rectangle',
          label: ent.name || `Component ${i + 1}`,
        });
      }
    } else if (files.length > 0) {
      for (let i = 0; i < Math.min(files.length, 8); i++) {
        const f = files[i];
        const baseName = f.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || `Node_${i + 1}`;
        elements.push({
          id: `el_${i + 1}`,
          type: 'rectangle',
          label: baseName,
        });
      }
    }

    if (elements.length === 0) {
      elements.push(
        { id: 'el_1', type: 'rectangle', label: 'Client / Interface' },
        { id: 'el_2', type: 'rectangle', label: 'Backend Controller' }
      );
    }

    const evidence = (files.length > 0 ? files : [{ path: 'architecture.pim' }]).slice(0, 2).map((f) => ({
      source: f.path,
      origin: 'diagram',
      confidence: 0.98,
      method: 'diagram',
    }));

    return {
      data: {
        diagramId: `diag_${Date.now()}`,
        elements,
      },
      evidence,
      confidence: 0.98,
      recommendations: ['Group related components inside functional subsystem boundaries'],
    };
  }
}
