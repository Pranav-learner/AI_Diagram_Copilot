import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ExecutionFramework,
  ExecutionContext,
  AgentRegistry,
  AgentValidator,
  ArchitectureAgent,
  DiagramAgent,
  DocumentationAgent,
  RepositoryAgent,
  SecurityAgent,
  PerformanceAgent,
  DatabaseAgent,
  DevOpsAgent,
  BackendAgent,
  FrontendAgent,
  TestingAgent,
  ReviewerAgent,
} from '../../index';

describe('Specialist Agents Framework', () => {
  let framework: ExecutionFramework;
  let registry: AgentRegistry;

  beforeEach(() => {
    framework = new ExecutionFramework();
    registry = new AgentRegistry();
  });

  describe('Agent Manifest & Registry Discovery', () => {
    it('should register and discover agents based on capabilities', () => {
      const archAgent = new ArchitectureAgent();
      const diagAgent = new DiagramAgent();

      registry.register(archAgent.manifest, archAgent);
      registry.register(diagAgent.manifest, diagAgent);

      const foundArch = registry.discover({ capabilities: ['architecture:analyze'] });
      expect(foundArch.length).toBe(1);
      expect(foundArch[0].id).toBe('architecture-agent');

      const foundDiag = registry.discover({ capabilities: ['diagram:generate'] });
      expect(foundDiag.length).toBe(1);
      expect(foundDiag[0].id).toBe('diagram-agent');
    });

    it('should support discovery filtering by cost and latency', () => {
      const archAgent = new ArchitectureAgent();
      registry.register(archAgent.manifest, archAgent);

      // Total cost per million = 3 + 15 = 18
      const foundCheap = registry.discover({ maxCost: 10 });
      expect(foundCheap.length).toBe(0);

      const foundExpensive = registry.discover({ maxCost: 20 });
      expect(foundExpensive.length).toBe(1);

      // Expected P50 = 1200ms
      const foundFast = registry.discover({ maxLatency: 1000 });
      expect(foundFast.length).toBe(0);

      const foundSlower = registry.discover({ maxLatency: 1500 });
      expect(foundSlower.length).toBe(1);
    });

    it('should support discovery filtering by version, health, and permissions', () => {
      const archAgent = new ArchitectureAgent();
      registry.register(archAgent.manifest, archAgent);

      const foundV1 = registry.discover({ version: '1.0.0' });
      expect(foundV1.length).toBe(1);

      const foundHealthy = registry.discover({ health: 'healthy' });
      expect(foundHealthy.length).toBe(1);

      const foundPermitted = registry.discover({ permissions: ['read:pim', 'read:pkm'] });
      expect(foundPermitted.length).toBe(1);

      const foundUnpermitted = registry.discover({ permissions: ['read:pim'] });
      expect(foundUnpermitted.length).toBe(0);
    });
  });

  describe('Agent Context Slicing & Restriction', () => {
    it('should restrict PIM entities and ontology concepts', async () => {
      const dbAgent = new DatabaseAgent();
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'analyze database',
        permissions: ['*'],
        metadata: {
          pim: {
            entities: [
              { id: 'e1', name: 'users', kind: 'table' },
              { id: 'e2', name: 'UserService', kind: 'service' },
            ],
          },
        },
      });

      const result = await dbAgent.execute(context);
      expect(result.success).toBe(true);
      // BaseSpecialistAgent slices PIM: DatabaseAgent only gets database, table, schema
      const dataOutput = result.data as any;
      expect(dataOutput.success).toBe(true);
    });
  });

  describe('Agent Contract Output & Validation', () => {
    it('should reject outputs failing the output Zod schema', async () => {
      const archAgent = new ArchitectureAgent();
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'architecture scan',
        permissions: ['*'],
        metadata: {
          mockAgentResponse: {
            'architecture-agent': {
              data: {
                // missing layers and components fields
                architectureStyle: 'SOA',
              },
              evidence: [{ source: 'arch.doc', origin: 'document', confidence: 0.9, method: 'documentation' }],
              confidence: 0.9,
            },
          },
        },
      });

      const result = await archAgent.execute(context);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('schema validation failed');
    });

    it('should reject outputs lacking evidence or invalid confidence', async () => {
      const archAgent = new ArchitectureAgent();
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'architecture scan',
        permissions: ['*'],
        metadata: {
          mockAgentResponse: {
            'architecture-agent': {
              data: {
                architectureStyle: 'SOA',
                layers: [],
                components: [],
              },
              evidence: [], // empty evidence
              confidence: 1.5, // invalid confidence > 1
            },
          },
        },
      });

      const result = await archAgent.execute(context);
      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/evidence|Confidence/);
    });

    it('should enforce permission compliance checks before execution', async () => {
      const reviewer = new ReviewerAgent();
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'review code',
        permissions: [], // no permissions (requires read:code)
      });

      const isValid = await reviewer.validate?.(context);
      expect(isValid).toBe(false);

      const contextWithPerms = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'review code',
        permissions: ['read:code'],
      });
      const isValidWithPerms = await reviewer.validate?.(contextWithPerms);
      expect(isValidWithPerms).toBe(true);
    });
  });

  describe('Specialist Agents Execution', () => {
    const agents = [
      new ArchitectureAgent(),
      new DiagramAgent(),
      new DocumentationAgent(),
      new RepositoryAgent(),
      new SecurityAgent(),
      new PerformanceAgent(),
      new DatabaseAgent(),
      new DevOpsAgent(),
      new BackendAgent(),
      new FrontendAgent(),
      new TestingAgent(),
      new ReviewerAgent(),
    ];

    it.each(agents)('should execute $name successfully', async (agent) => {
      const context = new ExecutionContext({
        taskId: 'test-task',
        sessionId: 'test-session',
        userGoal: 'Run agent test',
        permissions: ['*'],
        metadata: {
          inputData: agent.id === 'backend-agent' ? { serviceName: 'users' } :
                     agent.id === 'frontend-agent' ? { componentName: 'Button' } :
                     agent.id === 'testing-agent' ? { targetFile: 'index.js' } :
                     agent.id === 'reviewer-agent' ? { changeId: 'pr-1' } :
                     agent.id === 'documentation-agent' ? { topic: 'Setup' } :
                     agent.id === 'repository-agent' ? { query: 'db' } : {},
        },
      });

      const result = await agent.execute(context);
      expect(result.success).toBe(true);

      const output = result.data as any;
      expect(output.success).toBe(true);
      expect(output.confidence).toBeGreaterThanOrEqual(0.0);
      expect(output.confidence).toBeLessThanOrEqual(1.0);
      expect(output.evidence.length).toBeGreaterThan(0);
      expect(output.executionMetadata.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should invoke tools through framework during execution', async () => {
      const archAgent = new ArchitectureAgent();
      const executeToolMock = vi.fn().mockResolvedValue({ queryResult: 'success' });
      const mockFramework = {
        executeTool: executeToolMock,
      };

      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'Run with tools',
        permissions: ['*'],
        metadata: {
          framework: mockFramework,
        },
      });

      const result = await archAgent.execute(context);
      expect(result.success).toBe(true);
      expect(executeToolMock).toHaveBeenCalledWith('knowledge:query', expect.any(Object), context);
    });

    it('should execute multiple agents in parallel', async () => {
      const archAgent = new ArchitectureAgent();
      const securityAgent = new SecurityAgent();

      framework.execution.register(archAgent);
      framework.execution.register(securityAgent);

      const context = new ExecutionContext({
        taskId: 'parallel-task',
        sessionId: 'parallel-session',
        userGoal: 'Run parallel',
        permissions: ['*'],
      });

      const [resArch, resSec] = await Promise.all([
        framework.run(archAgent.id, context),
        framework.run(securityAgent.id, context),
      ]);

      expect(resArch.success).toBe(true);
      expect(resSec.success).toBe(true);
    });
  });
});
