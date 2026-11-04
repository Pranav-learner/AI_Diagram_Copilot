import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class FrontendAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'frontend-agent',
    name: 'Frontend Developer',
    description: 'Generates user interface layouts, React components, styling structures, and mock views.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['frontend:codegen', 'frontend:ui:generate'],
    requiredContext: ['code'],
    supportedTools: ['repository:search'],
    permissions: ['read:code', 'write:code'],
    inputSchema: z.object({
      componentName: z.string(),
    }),
    outputSchema: z.object({
      framework: z.string(),
      stylePreset: z.string(),
      markup: z.string(),
      props: z.array(z.string()),
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

    const input = context.executionContext.metadata.inputData || { componentName: 'MainView' };
    const componentName = input.componentName || 'View';

    await this.invokeTool('repository:search', { query: componentName }, context.executionContext);

    const files = this.getRepoFiles(context.executionContext);
    let framework = 'React';
    let stylePreset = 'Tailwind CSS';

    if (files.some((f) => f.path.endsWith('.vue'))) {
      framework = 'Vue';
      stylePreset = 'Scoped CSS';
    } else if (files.some((f) => f.path.endsWith('.svelte'))) {
      framework = 'Svelte';
      stylePreset = 'Svelte Scoped CSS';
    } else if (files.some((f) => f.content.includes('styled-components'))) {
      stylePreset = 'Styled Components';
    }

    const matchingFile = files.find((f) => f.path.toLowerCase().includes(componentName.toLowerCase()));
    const evidenceSource = matchingFile ? matchingFile.path : (files.find((f) => /\.(tsx|jsx|vue)$/.test(f.path))?.path || `src/components/${componentName}.tsx`);

    return {
      data: {
        framework,
        stylePreset,
        markup: `<div className="component-${componentName.toLowerCase()}"><header>${componentName}</header><main>{/* Content */}</main></div>`,
        props: ['id', 'className', 'onAction'],
      },
      evidence: [{ source: evidenceSource, origin: 'code', confidence: 0.95, method: 'static-analysis' }],
      confidence: 0.95,
      recommendations: ['Ensure appropriate ARIA accessibility attributes and responsive layouts'],
    };
  }
}
