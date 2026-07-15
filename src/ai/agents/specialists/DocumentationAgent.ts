import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class DocumentationAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'documentation-agent',
    name: 'Documentation Specialist',
    description: 'Generates user guides, reference manuals, and system documentation in Markdown.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['documentation:write', 'documentation:update'],
    requiredContext: ['pkm'],
    supportedTools: ['knowledge:query'],
    permissions: ['read:pkm', 'write:pkm'],
    inputSchema: z.object({
      topic: z.string(),
    }),
    outputSchema: z.object({
      docTitle: z.string(),
      contentMarkdown: z.string(),
      sections: z.array(z.string()),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.0,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 2000,
      expectedP95Ms: 5000,
    },
    supportedModels: ['claude-3-sonnet', 'gemini-1.5-flash'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('knowledge:query', { query: 'Query documentation topics' }, context.executionContext);

    return {
      data: {
        docTitle: 'System Setup Guide',
        contentMarkdown: '# System Setup\nThis guides you through setting up...',
        sections: ['System Setup', 'Installation', 'Verifying Setup'],
      },
      evidence: [{ source: 'README.md', origin: 'document', confidence: 0.9, method: 'documentation' }],
      confidence: 0.92,
      recommendations: ['Add troubleshooting section to setup guide'],
    };
  }
}
