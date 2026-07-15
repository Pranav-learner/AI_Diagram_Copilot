import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ExecutionFramework,
  ExecutionContext,
  CancellationToken,
  ProgressReporter,
  PermissionManager,
  type ExecutionUnit,
  type ExecutionResult,
  type Tool,
  type Plugin,
} from '../../index';

describe('AI Execution Framework (AEF)', () => {
  let framework: ExecutionFramework;

  beforeEach(() => {
    framework = new ExecutionFramework({ concurrencyLimit: 2 });
  });

  describe('Permission System', () => {
    it('should validate standard exact permissions', () => {
      const pm = new PermissionManager(['read:pim', 'read:pkm']);
      expect(pm.check('read:pim')).toBe(true);
      expect(pm.check('diagram:generate')).toBe(false);
    });

    it('should support wildcard "*" matches', () => {
      const pm = new PermissionManager(['*']);
      expect(pm.check('read:pim')).toBe(true);
      expect(pm.check('diagram:generate')).toBe(true);
    });

    it('should support namespace wildcard matching', () => {
      const pm = new PermissionManager(['diagram:*', 'api:call']);
      expect(pm.check('diagram:generate')).toBe(true);
      expect(pm.check('diagram:modify')).toBe(true);
      expect(pm.check('api:call')).toBe(true);
      expect(pm.check('read:pim')).toBe(false);
    });

    it('should grant and revoke permissions dynamically', () => {
      const pm = new PermissionManager(['read:pim']);
      expect(pm.check('read:pkm')).toBe(false);
      pm.grant('read:pkm');
      expect(pm.check('read:pkm')).toBe(true);
      pm.revoke('read:pim');
      expect(pm.check('read:pim')).toBe(false);
    });
  });

  describe('Execution Context & Budgets', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = new ExecutionContext({
        taskId: 'task-123',
        sessionId: 'session-456',
        userGoal: 'Test goal',
        permissions: ['read:pim'],
        budget: {
          tokenLimit: 100,
          maxSteps: 3,
        },
      });
    });

    it('should check permissions in context', () => {
      expect(context.hasPermission('read:pim')).toBe(true);
      expect(context.hasPermission('write:pim')).toBe(false);
    });

    it('should track token budget and throw if exceeded', () => {
      context.recordTokens({ promptTokens: 40, completionTokens: 40, totalTokens: 80 });
      expect(context.metrics.tokensUsed).toBe(80);

      expect(() => {
        context.recordTokens({ promptTokens: 10, completionTokens: 15, totalTokens: 25 });
      }).toThrow(/Token budget exhausted/);
    });

    it('should track step budget and throw if exceeded', () => {
      context.incrementSteps();
      context.incrementSteps();
      context.incrementSteps();
      expect(context.metrics.stepsCount).toBe(3);

      expect(() => {
        context.incrementSteps();
      }).toThrow(/Execution step budget exhausted/);
    });

    it('should report progress to subscribers', () => {
      const callback = vi.fn();
      context.progressReporter.subscribe(callback);
      context.reportProgress(0.5, 'Step 1 complete');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].progress).toBe(0.5);
      expect(callback.mock.calls[0][0].message).toBe('Step 1 complete');
    });
  });

  describe('Execution Registry', () => {
    it('should register and retrieve units', () => {
      const mockUnit: ExecutionUnit = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'agent',
        version: '1.0.0',
        execute: async () => ({ success: true, executionTimeMs: 0 }),
      };

      framework.execution.register(mockUnit);
      expect(framework.execution.has('test-agent')).toBe(true);
      expect(framework.execution.get('test-agent')).toBe(mockUnit);
      expect(framework.execution.byType('agent')).toContain(mockUnit);
    });
  });

  describe('Tools & ToolRegistry', () => {
    const searchTool: Tool = {
      id: 'search',
      name: 'Search Tool',
      description: 'Searches knowledge base',
      permissionsRequired: ['read:pkm'],
      inputSchema: z.object({ query: z.string() }),
      execute: async (args) => `Results for ${args.query}`,
    };

    beforeEach(() => {
      framework.tools.register(searchTool);
    });

    it('should execute tools with proper validation and permissions', async () => {
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'g',
        permissions: ['read:pkm'],
      });

      const result = await framework.executeTool('search', { query: 'diagrams' }, context);
      expect(result).toBe('Results for diagrams');
    });

    it('should block tool execution if permission is missing', async () => {
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'g',
        permissions: [],
      });

      await expect(
        framework.executeTool('search', { query: 'diagrams' }, context)
      ).rejects.toThrow(/Permission denied/);
    });

    it('should validate tool inputs using schema', async () => {
      const context = new ExecutionContext({
        taskId: 't1',
        sessionId: 's1',
        userGoal: 'g',
        permissions: ['read:pkm'],
      });

      await expect(
        framework.executeTool('search', { query: 123 }, context)
      ).rejects.toThrow();
    });
  });

  describe('Execution Lifecycle & Events', () => {
    it('should execute all lifecycle hooks in order', async () => {
      const initSpy = vi.fn();
      const valSpy = vi.fn(() => Promise.resolve(true));
      const execSpy = vi.fn(() => Promise.resolve({ success: true, data: 'OK', executionTimeMs: 0 }));
      const cleanSpy = vi.fn();

      const unit: ExecutionUnit = {
        id: 'lifecycle-unit',
        name: 'Lifecycle Unit',
        type: 'workflow-step',
        version: '1.0.0',
        initialize: initSpy,
        validate: valSpy,
        execute: execSpy,
        cleanup: cleanSpy,
      };

      framework.execution.register(unit);

      const context = new ExecutionContext({
        taskId: 't',
        sessionId: 's',
        userGoal: 'g',
        permissions: ['*'],
      });

      const startedSpy = vi.fn();
      const completedSpy = vi.fn();
      framework.events.subscribe('execution:started', startedSpy);
      framework.events.subscribe('execution:completed', completedSpy);

      const result = await framework.run('lifecycle-unit', context);

      expect(result.success).toBe(true);
      expect(result.data).toBe('OK');

      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(valSpy).toHaveBeenCalledTimes(1);
      expect(execSpy).toHaveBeenCalledTimes(1);
      expect(cleanSpy).toHaveBeenCalledTimes(1);

      expect(startedSpy).toHaveBeenCalledTimes(1);
      expect(completedSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Execution Manager Capabilities', () => {
    it('should enforce concurrency limits and queue execution units', async () => {
      const unit: ExecutionUnit = {
        id: 'slow-unit',
        name: 'Slow Unit',
        type: 'background-job',
        version: '1.0.0',
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { success: true, executionTimeMs: 0 };
        },
      };

      framework.execution.register(unit);

      const context1 = new ExecutionContext({ taskId: 't1', sessionId: 's1', userGoal: 'g' });
      const context2 = new ExecutionContext({ taskId: 't2', sessionId: 's2', userGoal: 'g' });
      const context3 = new ExecutionContext({ taskId: 't3', sessionId: 's3', userGoal: 'g' });

      // Run three concurrent units. Since concurrencyLimit is 2, the third should wait.
      const p1 = framework.run('slow-unit', context1);
      const p2 = framework.run('slow-unit', context2);
      const p3 = framework.run('slow-unit', context3);

      // Wait a short moment for async state changes and queue allocation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(framework.manager['activeCount']).toBe(2);

      await Promise.all([p1, p2, p3]);
      expect(framework.manager['activeCount']).toBe(0);
    });

    it('should retry failing units with backoff', async () => {
      let attempts = 0;
      const failingUnit: ExecutionUnit = {
        id: 'retry-unit',
        name: 'Retry Unit',
        type: 'agent',
        version: '1.0.0',
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            return { success: false, error: new Error('Transient error'), executionTimeMs: 0 };
          }
          return { success: true, data: 'Success', executionTimeMs: 0 };
        },
      };

      framework.execution.register(failingUnit);
      const context = new ExecutionContext({ taskId: 't', sessionId: 's', userGoal: 'g' });

      const result = await framework.run('retry-unit', context, {
        maxRetries: 3,
        initialDelayMs: 5,
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should timeout execution units exceeding budget', async () => {
      const longUnit: ExecutionUnit = {
        id: 'timeout-unit',
        name: 'Timeout Unit',
        type: 'agent',
        version: '1.0.0',
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { success: true, executionTimeMs: 0 };
        },
      };

      framework.execution.register(longUnit);
      const context = new ExecutionContext({
        taskId: 't',
        sessionId: 's',
        userGoal: 'g',
        budget: { timeoutMs: 20 },
      });

      const result = await framework.run('timeout-unit', context);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
    });

    it('should cancel running units instantly', async () => {
      const cancelToken = new CancellationToken();
      const cancelUnit: ExecutionUnit = {
        id: 'cancel-unit',
        name: 'Cancel Unit',
        type: 'agent',
        version: '1.0.0',
        execute: async (ctx) => {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, 200);
            ctx.cancellationToken.onCancel(() => {
              clearTimeout(timeout);
              reject(new Error('Abort'));
            });
          });
          return { success: true, executionTimeMs: 0 };
        },
      };

      framework.execution.register(cancelUnit);
      const context = new ExecutionContext({
        taskId: 't',
        sessionId: 's',
        userGoal: 'g',
        cancellationToken: cancelToken,
      });

      const promise = framework.run('cancel-unit', context);

      // Cancel the token after 10ms
      setTimeout(() => {
        cancelToken.cancel('User requested stop');
      }, 10);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(context.cancellationToken.isCancelled).toBe(true);
    });
  });

  describe('Plugin System', () => {
    it('should dynamically register capabilities, tools, and execution units', async () => {
      const dummyPlugin: Plugin = {
        manifest: {
          id: 'test-plugin',
          name: 'Test Extension',
          version: '1.0.0',
          capabilities: [
            {
              descriptor: {
                id: 'custom-skill',
                version: '1.0.0',
                name: 'Custom Skill',
                description: 'Does something custom',
                type: 'agent',
                permissions: [],
                dependencies: [],
              },
            },
          ],
          tools: [
            {
              id: 'plugin-tool',
              name: 'Plugin Tool',
              description: 'Exposed by plugin',
              permissionsRequired: [],
              execute: async () => 'Plugin data',
            },
          ],
          executionUnits: [
            {
              id: 'plugin-agent',
              name: 'Plugin Agent',
              type: 'agent',
              version: '1.0.0',
              execute: async () => ({ success: true, data: 'Executed in plugin', executionTimeMs: 0 }),
            },
          ],
        },
        initialize: async () => {},
        cleanup: async () => {},
      };

      await framework.plugins.register(dummyPlugin);

      expect(framework.capabilities.has('custom-skill')).toBe(true);
      expect(framework.tools.has('plugin-tool')).toBe(true);
      expect(framework.execution.has('plugin-agent')).toBe(true);

      const context = new ExecutionContext({ taskId: 't', sessionId: 's', userGoal: 'g' });
      const result = await framework.run('plugin-agent', context);
      expect(result.success).toBe(true);
      expect(result.data).toBe('Executed in plugin');

      await framework.plugins.deregister('test-plugin');
      expect(framework.capabilities.has('custom-skill')).toBe(false);
      expect(framework.tools.has('plugin-tool')).toBe(false);
      expect(framework.execution.has('plugin-agent')).toBe(false);
    });
  });
});
