import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExecutionFramework,
  ExecutionContext,
  MissionCoordinator,
  MissionPlanner,
  MissionValidator,
  InMemoryMissionHistoryStore,
  RepositoryAgent,
  ArchitectureAgent,
  ReviewerAgent,
  DiagramAgent,
  DocumentationAgent,
  SecurityAgent,
  PerformanceAgent,
  DatabaseAgent,
  DevOpsAgent,
  MissionContext,
  type Mission,
} from '../../index';

describe('Autonomous Engineering System Missions', () => {
  let framework: ExecutionFramework;
  let historyStore: InMemoryMissionHistoryStore;
  let coordinator: MissionCoordinator;

  const inputData = {
    query: 'db',
    topic: 'Setup',
    serviceName: 'users',
    componentName: 'Button',
    targetFile: 'index.js',
    changeId: 'pr-1',
  };

  beforeEach(() => {
    framework = new ExecutionFramework();
    historyStore = new InMemoryMissionHistoryStore();
    coordinator = new MissionCoordinator(framework, historyStore);

    // Register all required agents
    framework.execution.register(new RepositoryAgent());
    framework.execution.register(new ArchitectureAgent());
    framework.execution.register(new ReviewerAgent());
    framework.execution.register(new DiagramAgent());
    framework.execution.register(new DocumentationAgent());
    framework.execution.register(new SecurityAgent());
    framework.execution.register(new PerformanceAgent());
    framework.execution.register(new DatabaseAgent());
    framework.execution.register(new DevOpsAgent());
  });

  describe('Mission Planning & Graph Compilation', () => {
    it('should map built-in mission type to correct execution plan', () => {
      const mission: Mission = {
        id: 'm1',
        type: 'architecture_review',
        goal: 'Review systems architecture',
        priority: 'high',
        riskLevel: 'low',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Analyze codebase files', checked: false },
          { id: 'arch_analysis_crit', description: 'Evaluate layers and components', checked: false },
          { id: 'code_review_crit', description: 'Audit compliance', checked: false },
        ],
        requiredOutputs: ['reports', 'reviews'],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan code', description: 'Scan code files', status: 'pending' },
          { id: 'arch_analysis', name: 'Evaluate Architecture', description: 'Analyze patterns', status: 'pending', dependsOn: ['repo_analysis'] },
          { id: 'code_review', name: 'Perform Review', description: 'Check standards', status: 'pending', dependsOn: ['repo_analysis', 'arch_analysis'] },
        ],
        artifacts: [],
      };

      const spm = MissionPlanner.plan(mission, 's1');
      expect(spm.tasks.length).toBe(3);
      expect(spm.tasks[0].unitId).toBe('repository-agent');
      expect(spm.tasks[1].unitId).toBe('architecture-agent');
      expect(spm.tasks[2].unitId).toBe('reviewer-agent');

      const graph = MissionPlanner.compile(spm);
      expect(graph.nodes.size).toBe(3);
      expect(graph.edges.length).toBe(3);
    });
  });

  describe('Mission Execution, Aggregation, Validation', () => {
    it('should execute architecture_review to completion', async () => {
      const mission: Mission = {
        id: 'm-exec',
        type: 'architecture_review',
        goal: 'Scan architecture',
        priority: 'medium',
        riskLevel: 'low',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Inspect code', checked: false },
          { id: 'arch_analysis_crit', description: 'Inspect patterns', checked: false },
          { id: 'code_review_crit', description: 'Verify compliance', checked: false },
        ],
        requiredOutputs: ['reports'],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan code', description: 'Read repository files', status: 'pending' },
          { id: 'arch_analysis', name: 'Analyze patterns', description: 'Evaluate architectural style', status: 'pending', dependsOn: ['repo_analysis'] },
          { id: 'code_review', name: 'Verify compliance', description: 'Check standard style rules', status: 'pending', dependsOn: ['repo_analysis', 'arch_analysis'] },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-exec',
        sessionId: 's-exec',
        userGoal: 'Run mission',
        permissions: ['*'],
        metadata: {
          inputData,
        },
      });

      const missionContext = new MissionContext(mission, execContext);
      const result = await coordinator.run(missionContext);

      expect(result.success).toBe(true);
      expect(result.reports.length).toBeGreaterThan(0);
      expect(result.reviews.length).toBeGreaterThan(0);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(mission.status).toBe('completed');
      expect(mission.progress).toBe(1.0);

      // Verify pluggable history store recorded the run
      const records = await historyStore.listRecords();
      expect(records.length).toBe(1);
      expect(records[0].missionId).toBe('m-exec');
    });

    it('should trigger dashboard metrics and progress tracking correctly', async () => {
      const mission: Mission = {
        id: 'm-dash',
        type: 'documentation_generation',
        goal: 'Generate reference documentation',
        priority: 'low',
        riskLevel: 'low',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Inspect code', checked: false },
          { id: 'doc_gen_crit', description: 'Write documentation', checked: false },
        ],
        requiredOutputs: ['reports'],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan code', description: 'Read repository files', status: 'pending' },
          { id: 'doc_gen', name: 'Write docs', description: 'Compile reference pages', status: 'pending', dependsOn: ['repo_analysis'] },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-dash',
        sessionId: 's-dash',
        userGoal: 'Run dashboard test',
        permissions: ['*'],
        metadata: {
          inputData,
        },
      });

      const missionContext = new MissionContext(mission, execContext);

      // Start running asynchronous so we can intercept dashboard metrics midway
      const runPromise = coordinator.run(missionContext);

      // Give a tiny delay to let graph compile and start
      await new Promise((resolve) => setTimeout(resolve, 5));

      const snapshot = coordinator.getDashboardSnapshot();
      expect(snapshot.missionId).toBe('m-dash');
      expect(['running', 'completed']).toContain(snapshot.status);
      expect(snapshot.graphNodesCount).toBe(2);
      expect(snapshot.graphEdgesCount).toBe(1);

      const finalResult = await runPromise;
      expect(finalResult.success).toBe(true);

      const finishedSnapshot = coordinator.getDashboardSnapshot();
      expect(finishedSnapshot.progress).toBe(1.0);
      expect(finishedSnapshot.pendingTasks.length).toBe(0);
    });
  });

  describe('Mission Execution Lifecycles: Pause, Resume, Cancellation', () => {
    it('should support pause and resume lifecycle triggers', async () => {
      const mission: Mission = {
        id: 'm-pause',
        type: 'repository_analysis',
        goal: 'Scan code structure',
        priority: 'low',
        riskLevel: 'low',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Analyze files', checked: false },
        ],
        requiredOutputs: [],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan files', description: 'Inspect code', status: 'pending' },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-pause',
        sessionId: 's-pause',
        userGoal: 'Run pause test',
        permissions: ['*'],
        metadata: {
          inputData,
        },
      });

      const missionContext = new MissionContext(mission, execContext);
      const runPromise = coordinator.run(missionContext);

      coordinator.pause();
      expect(mission.status).toBe('paused');

      coordinator.resume();
      expect(mission.status).toBe('running');

      const result = await runPromise;
      expect(result.success).toBe(true);
    });

    it('should support cancellation operations', async () => {
      const mission: Mission = {
        id: 'm-cancel',
        type: 'repository_analysis',
        goal: 'Read codebase files',
        priority: 'low',
        riskLevel: 'low',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Inspect files', checked: false },
        ],
        requiredOutputs: [],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan files', description: 'Inspect code', status: 'pending' },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-cancel',
        sessionId: 's-cancel',
        userGoal: 'Run cancel test',
        permissions: ['*'],
        metadata: {
          inputData,
        },
      });

      const missionContext = new MissionContext(mission, execContext);

      // Cancel token before/during initialization of coordinator execution
      coordinator.loadCheckpoint(JSON.stringify({
        taskId: 't-cancel',
        sessionId: 's-cancel',
        nodeStatuses: {},
        nodeResults: {},
        nodeErrors: {},
        contextMetadata: {},
      }));

      // Cancel directly
      execContext.cancellationToken.cancel('Mission cancelled by user');

      const runPromise = coordinator.run(missionContext);
      await expect(runPromise).rejects.toThrow('Mission cancelled by user');
      expect(mission.status).toBe('cancelled');
    });
  });

  describe('Large Multi-Agent Workflow Execution (Migration Planning)', () => {
    it('should coordinate all 4 agents in correct dependency sequence', async () => {
      const mission: Mission = {
        id: 'm-migration',
        type: 'migration_planning',
        goal: 'Evaluate stack migration',
        priority: 'critical',
        riskLevel: 'high',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Analyze code', checked: false },
          { id: 'arch_analysis_crit', description: 'Analyze architecture style', checked: false },
          { id: 'db_analysis_crit', description: 'Check DB tables', checked: false },
          { id: 'infra_plan_crit', description: 'Assess migration pipeline', checked: false },
        ],
        requiredOutputs: ['reports'],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Inspect current source', description: 'Scan code files', status: 'pending' },
          { id: 'arch_analysis', name: 'Evaluate Architecture', description: 'Assess layers', status: 'pending', dependsOn: ['repo_analysis'] },
          { id: 'db_analysis', name: 'Evaluate DB Schema', description: 'Assess database', status: 'pending', dependsOn: ['repo_analysis'] },
          { id: 'infra_plan', name: 'DevOps Plan', description: 'Build pipeline', status: 'pending', dependsOn: ['repo_analysis', 'arch_analysis', 'db_analysis'] },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-migration',
        sessionId: 's-migration',
        userGoal: 'Run migration planning mission',
        permissions: ['*'],
        metadata: {
          inputData,
        },
      });

      const missionContext = new MissionContext(mission, execContext);
      const result = await coordinator.run(missionContext);

      expect(result.success).toBe(true);
      expect(mission.status).toBe('completed');
      expect(mission.progress).toBe(1.0);
    });
  });
});
