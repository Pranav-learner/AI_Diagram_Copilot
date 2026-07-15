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

    await this.invokeTool('repository:search', { query: 'Search frontend component' }, context.executionContext);

    return {
      data: {
        framework: 'React',
        stylePreset: 'CSS Modules',
        markup: '<div className={styles.container}>User profile element</div>',
        props: ['userId', 'onSave'],
      },
      evidence: [{ source: 'src/components/UserProfile.tsx', origin: 'code', confidence: 0.95, method: 'static-analysis' }],
      confidence: 0.95,
      recommendations: ['Add accessibility role attributes to markup container'],
    };
  }
}
