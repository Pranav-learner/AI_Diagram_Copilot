import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class DatabaseAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'database-agent',
    name: 'Database Architect',
    description: 'Inspects schemas, designs entity relations, and analyzes sql query performances.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['database:schema:analyze', 'database:query:optimize'],
    requiredContext: ['pim'],
    supportedTools: ['knowledge:query'],
    permissions: ['read:pim'],
    inputSchema: z.object({
      schemaName: z.string().optional(),
    }),
    outputSchema: z.object({
      tables: z.array(
        z.object({
          name: z.string(),
          columns: z.array(z.string()),
          primaryKey: z.string(),
        })
      ),
      relations: z.array(
        z.object({
          fromTable: z.string(),
          toTable: z.string(),
          type: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.0,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1100,
      expectedP95Ms: 3200,
    },
    supportedModels: ['claude-3-sonnet', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('knowledge:query', { query: 'Query db schema tables' }, context.executionContext);

    return {
      data: {
        tables: [
          { name: 'users', columns: ['id', 'email', 'name'], primaryKey: 'id' },
          { name: 'orders', columns: ['id', 'user_id', 'total'], primaryKey: 'id' },
        ],
        relations: [
          { fromTable: 'orders', toTable: 'users', type: 'many-to-one' },
        ],
      },
      evidence: [{ source: 'schema.sql', origin: 'database', confidence: 0.97, method: 'schema' }],
      confidence: 0.97,
      recommendations: ['Add foreign key index on orders.user_id'],
    };
  }
}
