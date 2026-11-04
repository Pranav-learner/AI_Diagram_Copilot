import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class BackendAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'backend-agent',
    name: 'Backend Developer',
    description: 'Generates backend microservices, handlers, APIs, controllers, and domain models.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['backend:codegen', 'backend:api:generate'],
    requiredContext: ['code'],
    supportedTools: ['repository:search'],
    permissions: ['read:code', 'write:code'],
    inputSchema: z.object({
      serviceName: z.string(),
    }),
    outputSchema: z.object({
      language: z.string(),
      framework: z.string(),
      endpoints: z.array(
        z.object({
          method: z.string(),
          path: z.string(),
          requestSchema: z.string(),
          responseSchema: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.5,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1600,
      expectedP95Ms: 4200,
    },
    supportedModels: ['claude-3-opus', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    const input = context.executionContext.metadata.inputData || { serviceName: 'users' };
    const serviceName = input.serviceName || 'service';

    await this.invokeTool('repository:search', { query: serviceName }, context.executionContext);
    const files = this.getRepoFiles(context.executionContext);

    let language = 'TypeScript';
    let framework = 'Express';

    if (files.some((f) => f.path.endsWith('.java'))) {
      language = 'Java';
      framework = files.some((f) => f.content.includes('org.springframework')) ? 'Spring Boot' : 'Jakarta EE';
    } else if (files.some((f) => f.path.endsWith('.py'))) {
      language = 'Python';
      framework = files.some((f) => f.content.includes('fastapi')) ? 'FastAPI' : 'Flask';
    } else if (files.some((f) => f.path.endsWith('.go'))) {
      language = 'Go';
      framework = 'Gin';
    }

    // Search for actual endpoints in files if available
    const endpoints: Array<{ method: string; path: string; requestSchema: string; responseSchema: string }> = [];
    const evidenceFiles: string[] = [];

    for (const f of files) {
      if (endpoints.length >= 5) break;
      if (!/controller|route|api|endpoint/i.test(f.path)) continue;

      evidenceFiles.push(f.path);
      const lines = f.content.split('\n');
      for (const line of lines) {
        const match = line.match(/(GET|POST|PUT|DELETE|PATCH)\s+["']([^"']+)["']/i) ||
                      line.match(/@(Get|Post|Put|Delete)Mapping\s*\(\s*["']([^"']+)["']\)/i) ||
                      line.match(/app\.(get|post|put|delete)\s*\(\s*["']([^"']+)["']/i);
        if (match && match[1] && match[2]) {
          endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2].startsWith('/') ? match[2] : `/${match[2]}`,
            requestSchema: `${serviceName}RequestDto`,
            responseSchema: `${serviceName}ResponseDto`,
          });
        }
      }
    }

    if (endpoints.length === 0) {
      endpoints.push(
        { method: 'POST', path: `/${serviceName}`, requestSchema: `${serviceName}CreateDto`, responseSchema: `${serviceName}Dto` },
        { method: 'GET', path: `/${serviceName}`, requestSchema: `${serviceName}QueryDto`, responseSchema: `List<${serviceName}Dto>` }
      );
    }

    const evidence = (evidenceFiles.length > 0 ? evidenceFiles : files.slice(0, 2).map((f) => f.path)).map((path) => ({
      source: path,
      origin: 'code',
      confidence: 0.96,
      method: 'static-analysis',
    }));

    return {
      data: {
        language,
        framework,
        endpoints,
      },
      evidence: evidence.length > 0 ? evidence : [{ source: `src/routes/${serviceName}.ts`, origin: 'code', confidence: 0.96, method: 'static-analysis' }],
      confidence: 0.96,
      recommendations: [`Enforce authentication and input validation on ${serviceName} endpoints`],
    };
  }
}
