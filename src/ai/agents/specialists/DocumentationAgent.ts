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

    const input = context.executionContext.metadata.inputData || { topic: 'Architecture & Overview' };
    const topic = input.topic || 'System Architecture';

    await this.invokeTool('knowledge:query', { query: `Query documentation for ${topic}` }, context.executionContext);

    const files = this.getRepoFiles(context.executionContext);
    const entities = this.getEntities(context.executionContext);
    const readmeFile = files.find((f) => /readme\.md$/i.test(f.path));

    const docTitle = `${topic} Documentation`;
    const sections = ['Overview', 'Key Components', 'Module Details', 'Operational Notes'];

    const componentBullets = entities.length > 0
      ? entities.slice(0, 5).map((e) => `- **${e.name}**: ${e.kind || 'Component'}`).join('\n')
      : files.slice(0, 5).map((f) => `- \`${f.path}\``).join('\n');

    const contentMarkdown = `# ${docTitle}

## Overview
This technical documentation outlines the structure and design of the codebase focused on **${topic}**.

## Key Components
${componentBullets || '- Core system modules'}

## Operational Notes
- Designed for local verification and autonomous intelligence extraction.
`;

    const evidenceSource = readmeFile ? readmeFile.path : (files[0]?.path || 'README.md');

    return {
      data: {
        docTitle,
        contentMarkdown,
        sections,
      },
      evidence: [{ source: evidenceSource, origin: 'document', confidence: 0.94, method: 'documentation' }],
      confidence: 0.94,
      recommendations: ['Keep API and architecture documentation synchronized with code changes'],
    };
  }
}
