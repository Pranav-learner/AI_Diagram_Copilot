import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExecutionFramework,
  ExecutionContext,
  ExecutionCompiler,
  ExecutionOrchestrator,
  type SharedPlanningModel,
  type ExecutionGraph,
  type ExecutionUnit,
} from '../../index';
import { EventBus } from '../../events/EventBus';

describe('Execution Graph Compiler & Orchestrator', () => {
  let framework: ExecutionFramework;
  let eventBus: EventBus;
  let context: ExecutionContext;

  beforeEach(() => {
    framework = new ExecutionFramework({ concurrencyLimit: 4 });
    eventBus = new EventBus();
    context = new ExecutionContext({
      taskId: 'workflow-task-1',
      sessionId: 'workflow-session-1',
      userGoal: 'Run end-to-end workflow testing',
      permissions: ['*'],
      budget: {
        tokenLimit: 1000,
        maxSteps: 10,
      },
    });
  });

  describe('Execution Graph Compiler & Validator', () => {
    it('should successfully compile a valid Shared Planning Model into a DAG', () => {
      const spm: SharedPlanningModel = {
        taskId: 't1',
        sessionId: 's1',
        goal: 'test',
        tasks: [
          {
            id: 'task-a',
            name: 'Task A',
            description: 'Starts the workflow',
            unitId: 'unit-a',
            dependencies: [],
          },
          {
            id: 'task-b',
            name: 'Task B',
            description: 'Runs after A',
            unitId: 'unit-b',
            dependencies: ['task-a'],
          },
        ],
      };

      const graph = ExecutionCompiler.compile(spm);
      expect(graph.nodes.size).toBe(2);
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0].from).toBe('task-a');
      expect(graph.edges[0].to).toBe('task-b');
    });

    it('should throw an error during compilation if a cycle is detected', () => {
      const spm: SharedPlanningModel = {
        taskId: 't1',
        sessionId: 's1',
        goal: 'test',
        tasks: [
          {
            id: 'task-a',
            name: 'Task A',
            description: 'Starts the cycle',
            unitId: 'unit-a',
            dependencies: ['task-b'],
          },
          {
            id: 'task-b',
            name: 'Task B',
            description: 'Completes the cycle',
            unitId: 'unit-b',
            dependencies: ['task-a'],
          },
        ],
      };

      expect(() => ExecutionCompiler.compile(spm)).toThrow(/Cycle detected/);
    });

    it('should throw an error if no starting points are present', () => {
      const spm: SharedPlanningModel = {
        taskId: 't1',
        sessionId: 's1',
        goal: 'test',
        tasks: [
          {
            id: 'task-a',
            name: 'Task A',
            description: 'A',
            unitId: 'unit-a',
            dependencies: ['task-a'], // self cycle
          },
        ],
      };
      expect(() => ExecutionCompiler.compile(spm)).toThrow(/Cycle detected|No entry points/);
    });
  });

  describe('Execution Orchestrator', () => {
    beforeEach(() => {
      framework.execution.register({
        id: 'unit-a',
        name: 'Unit A',
        type: 'agent',
        version: '1.0.0',
        execute: async () => ({ success: true, data: { result: 'A_done' }, executionTimeMs: 0 }),
      });

      framework.execution.register({
        id: 'unit-b',
        name: 'Unit B',
        type: 'agent',
        version: '1.0.0',
        execute: async (ctx) => {
          const upstream = ctx.metadata.nodeResults?.['task-a'];
          return { success: true, data: { result: `B_done_with_${upstream?.result}` }, executionTimeMs: 0 };
        },
      });
    });

    it('should execute a sequential workflow respecting dependencies and passing upstream outputs', async () => {
      const spm: SharedPlanningModel = {
        taskId: 't1',
        sessionId: 's1',
        goal: 'sequential-test',
        tasks: [
          { id: 'task-a', name: 'Task A', description: 'a', unitId: 'unit-a', dependencies: [] },
          { id: 'task-b', name: 'Task B', description: 'b', unitId: 'unit-b', dependencies: ['task-a'] },
        ],
      };

      const graph = ExecutionCompiler.compile(spm);
      const orchestrator = new ExecutionOrchestrator(framework, { eventBus });
      
      const results = await orchestrator.execute(graph, context);

      expect(results.get('task-a')).toEqual({ result: 'A_done' });
      expect(results.get('task-b')).toEqual({ result: 'B_done_with_A_done' });
    });

    it('should execute branches in parallel', async () => {
      const activeRunning: string[] = [];
      const parallelLog: string[][] = [];

      framework.execution.register({
        id: 'parallel-unit',
        name: 'Parallel Unit',
        type: 'agent',
        version: '1.0.0',
        execute: async (ctx) => {
          const nodeId = ctx.taskId; // simulated nodeId or metadata
          activeRunning.push(nodeId);
          parallelLog.push([...activeRunning]);
          await new Promise((resolve) => setTimeout(resolve, 30));
          activeRunning.splice(activeRunning.indexOf(nodeId), 1);
          return { success: true, data: { ok: true }, executionTimeMs: 0 };
        },
      });

      const spm: SharedPlanningModel = {
        taskId: 't2',
        sessionId: 's2',
        goal: 'parallel-test',
        tasks: [
          { id: 'task-1', name: 'Task 1', description: '1', unitId: 'parallel-unit', dependencies: [] },
          { id: 'task-2', name: 'Task 2', description: '2', unitId: 'parallel-unit', dependencies: [] },
        ],
      };

      const graph = ExecutionCompiler.compile(spm);
      const orchestrator = new ExecutionOrchestrator(framework, { eventBus });

      await orchestrator.execute(graph, context);

      // Verify that at some point, both tasks were running together
      const reachedTwoConcurrency = parallelLog.some((list) => list.length === 2);
      expect(reachedTwoConcurrency).toBe(true);
    });

    it('should handle retries for failing nodes and succeed if subsequent attempt passes', async () => {
      let attempts = 0;
      framework.execution.register({
        id: 'retry-unit',
        name: 'Retry Unit',
        type: 'agent',
        version: '1.0.0',
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            return { success: false, error: new Error('Flaky failure'), executionTimeMs: 0 };
          }
          return { success: true, data: { attempts }, executionTimeMs: 0 };
        },
      });

      const spm: SharedPlanningModel = {
        taskId: 't3',
        sessionId: 's3',
        goal: 'retry-test',
        tasks: [
          {
            id: 'task-retry',
            name: 'Retry task',
            description: 'Retrying',
            unitId: 'retry-unit',
            dependencies: [],
            retryPolicy: {
              maxRetries: 3,
              initialDelayMs: 2,
              backoffMultiplier: 1.5,
            },
          },
        ],
      };

      const graph = ExecutionCompiler.compile(spm);
      const orchestrator = new ExecutionOrchestrator(framework, { eventBus });

      const results = await orchestrator.execute(graph, context);
      expect(results.get('task-retry')).toEqual({ attempts: 3 });
      expect(attempts).toBe(3);
    });

    it('should support conditional edges and skip disabled branches', async () => {
      framework.execution.register({
        id: 'branch-unit',
        name: 'Branch Unit',
        type: 'agent',
        version: '1.0.0',
        execute: async () => ({ success: true, data: { choice: 'skip_b' }, executionTimeMs: 0 }),
      });

      framework.execution.register({
        id: 'unit-c',
        name: 'Unit C',
        type: 'agent',
        version: '1.0.0',
        execute: async () => ({ success: true, data: { val: 'C' }, executionTimeMs: 0 }),
      });

      const spm: SharedPlanningModel = {
        taskId: 't4',
        sessionId: 's4',
        goal: 'conditional-test',
        tasks: [
          { id: 'task-a', name: 'Task A', description: 'a', unitId: 'branch-unit', dependencies: [] },
          { id: 'task-b', name: 'Task B', description: 'b', unitId: 'unit-b', dependencies: ['task-a'] },
          { id: 'task-c', name: 'Task C', description: 'c', unitId: 'unit-c', dependencies: ['task-a'] },
        ],
      };

      // Compile graph and manually inject conditions into compiled edges
      const graph = ExecutionCompiler.compile(spm);
      const modifiedEdges = graph.edges.map((edge) => {
        if (edge.to === 'task-b') {
          return {
            ...edge,
            condition: (ctx: any, results: ReadonlyMap<string, any>) => {
              const res = results.get('task-a');
              return res?.choice === 'run_b'; // evaluates to false
            },
          };
        }
        if (edge.to === 'task-c') {
          return {
            ...edge,
            condition: (ctx: any, results: ReadonlyMap<string, any>) => {
              const res = results.get('task-a');
              return res?.choice === 'skip_b'; // evaluates to true
            },
          };
        }
        return edge;
      });

      const finalGraph: ExecutionGraph = {
        ...graph,
        edges: modifiedEdges,
      };

      const orchestrator = new ExecutionOrchestrator(framework, { eventBus });
      const results = await orchestrator.execute(finalGraph, context);

      expect(results.has('task-a')).toBe(true);
      expect(results.get('task-b')).toEqual({ skipped: true });
      expect(results.get('task-c')).toEqual({ val: 'C' });
    });

    it('should support approval gates and block execution until approved', async () => {
      const runLog: string[] = [];
      framework.execution.register({
        id: 'approval-target',
        name: 'Approval Target',
        type: 'agent',
        version: '1.0.0',
        execute: async () => {
          runLog.push('target-ran');
          return { success: true, data: { approved_run: true }, executionTimeMs: 0 };
        },
      });

      const spm: SharedPlanningModel = {
        taskId: 't5',
        sessionId: 's5',
        goal: 'approval-test',
        tasks: [
          {
            id: 'task-approval',
            name: 'Approved Task',
            description: 'Requires human approval',
            unitId: 'approval-target',
            dependencies: [],
            approvalGate: {
              required: true,
              message: 'Check this workflow',
            },
          },
        ],
      };

      const graph = ExecutionCompiler.compile(spm);
      const orchestrator = new ExecutionOrchestrator(framework, { eventBus });

      let approved = false;

      // Subscribe to approval requested event to trigger approve
      eventBus.subscribe('approval:requested', (evt: any) => {
        expect(evt.nodeId).toBe('task-approval');
        expect(evt.message).toBe('Check this workflow');
        
        // Wait a brief moment then approve
        setTimeout(() => {
          approved = true;
          orchestrator.approveNode('task-approval');
        }, 10);
      });

      const results = await orchestrator.execute(graph, context);

      expect(approved).toBe(true);
      expect(runLog).toContain('target-ran');
      expect(results.get('task-approval')).toEqual({ approved_run: true });
    });

    it('should pause and resume execution from checkpoints', async () => {
      const runLog: string[] = [];

      framework.execution.register({
        id: 'step-1',
        name: 'Step 1',
        type: 'agent',
        version: '1.0.0',
        execute: async () => {
          runLog.push('step-1-ran');
          return { success: true, data: { step: 1 }, executionTimeMs: 0 };
        },
      });

      framework.execution.register({
        id: 'step-2',
        name: 'Step 2',
        type: 'agent',
        version: '1.0.0',
        execute: async () => {
          runLog.push('step-2-ran');
          return { success: true, data: { step: 2 }, executionTimeMs: 0 };
        },
      });

      const spm: SharedPlanningModel = {
        taskId: 't6',
        sessionId: 's6',
        goal: 'checkpoint-test',
        tasks: [
          { id: 'task-1', name: 'Task 1', description: 't1', unitId: 'step-1', dependencies: [] },
          { id: 'task-2', name: 'Task 2', description: 't2', unitId: 'step-2', dependencies: ['task-1'] },
        ],
      };

      const graph = ExecutionCompiler.compile(spm);
      const orchestrator = new ExecutionOrchestrator(framework, { eventBus });

      // Pause orchestrator immediately on step 1 completed event
      eventBus.subscribe('node:completed', (evt: any) => {
        if (evt.nodeId === 'task-1') {
          orchestrator.pause();
        }
      });

      // Execute. This will execute step-1 and then pause before step-2.
      const execPromise = orchestrator.execute(graph, context);

      // Give it time to run step 1 and pause
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(runLog).toContain('step-1-ran');
      expect(runLog).not.toContain('step-2-ran');

      // Create a checkpoint of the current state
      const checkpointJson = orchestrator.checkpoint();
      expect(checkpointJson).toContain('"task-1":"completed"');

      // Create a new orchestrator and load checkpoint
      const newOrchestrator = new ExecutionOrchestrator(framework, { eventBus });
      newOrchestrator.loadCheckpoint(checkpointJson);

      // Execute again on the new orchestrator
      const finalResults = await newOrchestrator.execute(graph, context);

      expect(runLog).toContain('step-2-ran');
      expect(finalResults.get('task-1')).toEqual({ step: 1 });
      expect(finalResults.get('task-2')).toEqual({ step: 2 });
    });
  });
});
