import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class TestingAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'testing-agent',
    name: 'Test Generator',
    description: 'Generates unit, integration, and end-to-end tests for code modules.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['testing:generate', 'testing:run'],
    requiredContext: ['code'],
    supportedTools: ['repository:search'],
    permissions: ['read:code', 'write:code'],
    inputSchema: z.object({
      targetFile: z.string(),
    }),
    outputSchema: z.object({
      testFramework: z.string(),
      testCases: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          assertions: z.array(z.string()),
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
    supportedModels: ['claude-3-sonnet', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    const input = context.executionContext.metadata.inputData || { targetFile: 'src/main.ts' };
    const targetFile = input.targetFile || 'index.ts';

    await this.invokeTool('repository:search', { query: 'test|spec|assert' }, context.executionContext);

    const files = this.getRepoFiles(context.executionContext);
    let testFramework = 'Vitest';

    if (files.some((f) => f.path.endsWith('.java'))) {
      testFramework = 'JUnit 5';
    } else if (files.some((f) => f.path.endsWith('.py'))) {
      testFramework = 'pytest';
    } else if (files.some((f) => f.content.includes('jest'))) {
      testFramework = 'Jest';
    }

    const baseName = targetFile.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'module';
    const testCases: Array<{ name: string; description: string; assertions: string[] }> = [
      {
        name: `should initialize and execute ${baseName} operations`,
        description: `Verifies standard execution and valid state transitions for ${baseName}`,
        assertions: testFramework === 'JUnit 5'
          ? ['assertNotNull(result)', 'assertEquals(Status.SUCCESS, result.getStatus())']
          : testFramework === 'pytest'
          ? ['assert result is not None', 'assert result.status == "success"']
          : ['expect(result).toBeDefined()', 'expect(result.status).toBe("success")'],
      },
      {
        name: `should handle error conditions gracefully in ${baseName}`,
        description: `Verifies error throwing and boundary validation when invalid inputs are provided to ${baseName}`,
        assertions: testFramework === 'JUnit 5'
          ? ['assertThrows(IllegalArgumentException.class, () -> execute(null))']
          : testFramework === 'pytest'
          ? ['with pytest.raises(ValueError): execute(None)']
          : ['expect(() => execute(null)).toThrow()'],
      },
    ];

    const evidenceSource = files.find((f) => f.path.includes(targetFile))?.path || targetFile;

    return {
      data: {
        testFramework,
        testCases,
      },
      evidence: [{ source: evidenceSource, origin: 'code', confidence: 0.97, method: 'static-analysis' }],
      confidence: 0.98,
      recommendations: [`Maintain at least 80% branch coverage for critical paths in ${baseName}`],
    };
  }
}
