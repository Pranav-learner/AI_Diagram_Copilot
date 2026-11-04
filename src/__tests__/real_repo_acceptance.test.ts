import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReverseEngineeringEngine,
  ProjectIntelligenceEngine,
  PimToDiagramAdapter,
  ExecutionFramework,
  ExecutionContext,
  MissionContext,
  MissionCoordinator,
  InMemoryMissionHistoryStore,
  RepositoryAgent,
  ArchitectureAgent,
  ReviewerAgent,
  SecurityAgent,
  type Mission,
  ASTInspectTool,
  KnowledgeQueryTool,
  RepositorySearchTool,
  nodesOfKind,
} from '../ai';

function walkDir(dir: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === '.git' || item === '__pycache__' || item.endsWith('.pyc') || item === 'node_modules') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      try {
        const content = fs.readFileSync(full, 'utf8');
        results.push({ path: full, content });
      } catch {
        // Skip binary files
      }
    }
  }
  return results;
}

describe('STEP 9: Real Repository Acceptance Testing', () => {
  describe('STAGE 1 & 2: Repository 1 — small_start_python', () => {
    const repoPath = path.resolve(process.cwd(), 'test_repos/small_start_python');
    let allFiles: Array<{ path: string; content: string }> = [];
    let engine: ProjectIntelligenceEngine;
    let re: ReverseEngineeringEngine;

    it('should discover and load all repository files from disk', () => {
      expect(fs.existsSync(repoPath)).toBe(true);
      allFiles = walkDir(repoPath);
      expect(allFiles.length).toBeGreaterThan(15);

      const pyFiles = allFiles.filter((f) => f.path.endsWith('.py'));
      expect(pyFiles.length).toBeGreaterThan(10);

      // Verify essential files exist
      const relPaths = allFiles.map((f) => path.relative(repoPath, f.path));
      expect(relPaths).toContain('main.py');
      expect(relPaths).toContain('app/config.py');
      expect(relPaths).toContain('app/routers/tasks.py');
      expect(relPaths).toContain('app/routers/auth.py');
      expect(relPaths).toContain('app/models/task.py');
      expect(relPaths).toContain('app/models/user.py');
      expect(relPaths).toContain('app/services/task_service.py');
      expect(relPaths).toContain('app/services/auth_service.py');
      expect(relPaths).toContain('app/repositories/task_repository.py');
      expect(relPaths).toContain('app/repositories/user_repository.py');
    });

    it('should parse Python AST, modules, classes, functions, and FastAPI endpoints', () => {
      engine = new ProjectIntelligenceEngine();
      re = new ReverseEngineeringEngine({ pkm: engine.knowledge() });

      for (const file of allFiles) {
        const rel = path.relative(repoPath, file.path);
        re.addFile(rel, file.content);
      }

      const stats = re.stats();
      expect(stats.files).toBeGreaterThan(15);
      expect(stats.parsed).toBeGreaterThan(10);
      expect(stats.entities).toBeGreaterThan(20);

      // Verify AST extraction on main.py
      const mainAst = re.getAST('main.py');
      expect(mainAst).toBeDefined();
      expect(mainAst?.language).toBe('python');

      // Verify AST extraction on models and classes
      const taskModelAst = re.getAST('app/models/task.py');
      expect(taskModelAst).toBeDefined();
      const taskClasses = nodesOfKind(taskModelAst!, 'class');
      expect(taskClasses.map((c) => c.name)).toContain('Task');

      const userModelAst = re.getAST('app/models/user.py');
      expect(userModelAst).toBeDefined();
      const userClasses = nodesOfKind(userModelAst!, 'class');
      expect(userClasses.map((c) => c.name)).toContain('User');

      // Verify AST extraction on endpoints in routers
      const tasksRouterAst = re.getAST('app/routers/tasks.py');
      expect(tasksRouterAst).toBeDefined();
      const endpoints = nodesOfKind(tasksRouterAst!, 'endpoint');
      expect(endpoints.length).toBeGreaterThan(0);

      // Verify function extraction
      const taskServiceAst = re.getAST('app/services/task_service.py');
      expect(taskServiceAst).toBeDefined();
      const funcs = nodesOfKind(taskServiceAst!, 'function');
      expect(funcs.length).toBeGreaterThan(0);
    });

    it('should build UIR, PKM, and fused PIM digital twin with source evidence', () => {
      const graph = re.getGraph();
      expect(graph).toBeDefined();
      expect(graph.entities().length).toBeGreaterThan(15);
      expect(graph.relations().length).toBeGreaterThan(10);

      engine.refresh();
      const pim = engine.getPIM();
      expect(pim).toBeDefined();

      const pimEntities = pim.entities();
      expect(pimEntities.length).toBeGreaterThan(10);

      // Verify source evidence traceability
      const entityWithEvidence = pimEntities.find((e) => e.evidence && e.evidence.length > 0);
      expect(entityWithEvidence).toBeDefined();
      expect(entityWithEvidence?.evidence[0]?.source).toBeDefined();

      // Verify module dependencies exist in the topology graph
      const relations = pim.relations();
      expect(relations.length).toBeGreaterThan(5);
    });

    it('should generate real Architecture, Component, and Dependency diagrams from PIM', () => {
      const pim = engine.getPIM();

      // 1. Architecture view
      const archResult = PimToDiagramAdapter.generate(pim, 'architecture');
      expect(archResult.plan.nodes.length).toBeGreaterThan(3);
      expect(archResult.elementCount).toBe(archResult.plan.nodes.length);
      expect(archResult.relationshipCount).toBe(archResult.plan.relationships.length);

      // 2. Component view
      const compResult = PimToDiagramAdapter.generate(pim, 'component');
      expect(compResult.plan.nodes.length).toBeGreaterThan(3);

      // 3. Dependencies view
      const depResult = PimToDiagramAdapter.generate(pim, 'dependencies');
      expect(depResult.plan.nodes.length).toBeGreaterThan(3);

      // Verify nodes have valid identifiers and labels
      for (const node of archResult.plan.nodes) {
        expect(node.id).toBeDefined();
        expect(node.label.length).toBeGreaterThan(0);
        expect(node.type).toBeDefined();
      }
    });

    it('should answer Copilot questions using ground truth source evidence', () => {
      const pim = engine.getPIM();
      const entities = pim.entities();
      const relations = pim.relations();

      // Q1: What is the entry point of this project?
      const mainEntity = entities.find((e) => e.name.toLowerCase().includes('main') || (e.description && e.description.includes('main.py')) || e.evidence.some((ev) => ev.source.includes('main.py')));
      expect(mainEntity).toBeDefined();
      expect(mainEntity?.evidence.some((ev) => ev.source.includes('main.py'))).toBe(true);

      // Q2: What are the main modules?
      const moduleNames = entities.map((e) => e.name);
      expect(moduleNames.some((n) => n.includes('tasks') || n.includes('auth') || n.includes('app'))).toBe(true);

      // Q3: Which modules depend on each other?
      expect(relations.length).toBeGreaterThan(0);
      const hasCallsOrImports = relations.some((r) => r.kind === 'imports' || r.kind === 'calls' || r.kind === 'depends_on' || r.kind === 'composes' || r.kind === 'contains');
      expect(hasCallsOrImports).toBe(true);

      // Q4: Which functions are responsible for the primary workflow?
      const taskServiceAst = re.getAST('app/services/task_service.py');
      const serviceFunctions = taskServiceAst ? nodesOfKind(taskServiceAst, 'function') : [];
      expect(serviceFunctions.length).toBeGreaterThan(0);

      // Q5: Execution flow verification
      // main.py -> app.routers.tasks -> app.services.task_service -> app.repositories.task_repository
      const filesWithCode = re.asTList().map((a) => a.file);
      expect(filesWithCode).toContain('main.py');
      expect(filesWithCode).toContain('app/routers/tasks.py');
      expect(filesWithCode).toContain('app/services/task_service.py');
      expect(filesWithCode).toContain('app/repositories/task_repository.py');
    });

    it('should execute an Autonomous Engineering Mission with real specialist agents', async () => {
      const framework = new ExecutionFramework();
      const historyStore = new InMemoryMissionHistoryStore();
      const coordinator = new MissionCoordinator(framework, historyStore);

      const pim = engine.getPIM();
      const knowledgeTool = new KnowledgeQueryTool({ pim });
      const searchTool = new RepositorySearchTool({ files: allFiles });
      const astTool = new ASTInspectTool({ astList: re.asTList() });

      const repoAgent = new RepositoryAgent({ tools: [searchTool, astTool] });
      const archAgent = new ArchitectureAgent({ tools: [knowledgeTool] });
      const reviewerAgent = new ReviewerAgent({ tools: [knowledgeTool, searchTool] });

      framework.execution.register(repoAgent);
      framework.execution.register(archAgent);
      framework.execution.register(reviewerAgent);

      const mission: Mission = {
        id: 'small_start_analysis',
        type: 'architecture_review',
        goal: 'Perform architecture review of small_start_python repository',
        priority: 'high',
        riskLevel: 'low',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Analyze repository files', checked: false },
          { id: 'arch_analysis_crit', description: 'Analyze architecture patterns', checked: false },
          { id: 'code_review_crit', description: 'Review code quality', checked: false },
        ],
        requiredOutputs: ['reports', 'reviews'],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan repository', description: 'Scan code files', status: 'pending' },
          { id: 'arch_analysis', name: 'Evaluate Architecture', description: 'Analyze layers and patterns', status: 'pending', dependsOn: ['repo_analysis'] },
          { id: 'code_review', name: 'Code Review', description: 'Audit architectural consistency', status: 'pending', dependsOn: ['repo_analysis', 'arch_analysis'] },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-small-start',
        sessionId: 's-small-start',
        userGoal: 'Analyze small_start_python repository',
        permissions: ['*'],
        metadata: {
          inputData: {
            changeId: 'rev-small-start-001',
            query: 'task',
            targetFile: 'main.py',
            serviceName: 'task_service',
          },
        },
      });

      const missionContext = new MissionContext(mission, execContext);
      const result = await coordinator.run(missionContext);

      expect(result.success).toBe(true);
      expect(result.reports.length).toBeGreaterThan(0);
      expect(mission.status).toBe('completed');
      expect(mission.progress).toBe(1.0);

      // Verify mission history store recorded run
      const records = await historyStore.listRecords();
      expect(records.length).toBe(1);
      expect(records[0].missionId).toBe('small_start_analysis');
    });
  });

  describe('STAGE 3: Repository 2 — LexiMind (Autonomous AI & LLM System)', () => {
    const repoPath = path.resolve(process.cwd(), 'test_repos/LexiMind');
    let appFiles: Array<{ path: string; content: string }> = [];
    let engine: ProjectIntelligenceEngine;
    let re: ReverseEngineeringEngine;

    it('should discover and load core LexiMind backend files from disk', () => {
      expect(fs.existsSync(repoPath)).toBe(true);
      const appDir = path.join(repoPath, 'backend/app');
      appFiles = walkDir(appDir);
      expect(appFiles.length).toBeGreaterThan(50);

      const agentFiles = appFiles.filter((f) => f.path.includes('/agents/'));
      expect(agentFiles.length).toBeGreaterThan(15);
    });

    it('should parse LexiMind ASTs and extract multi-agent architectures and services', () => {
      engine = new ProjectIntelligenceEngine();
      re = new ReverseEngineeringEngine({ pkm: engine.knowledge() });

      // Ingest the key modules: agents, analytics, and api
      const targetFiles = appFiles.filter(
        (f) => f.path.includes('/agents/') || f.path.includes('/analytics/') || f.path.includes('main.py')
      );

      for (const file of targetFiles) {
        const rel = path.relative(repoPath, file.path);
        re.addFile(rel, file.content);
      }

      const stats = re.stats();
      expect(stats.files).toBeGreaterThan(20);
      expect(stats.entities).toBeGreaterThan(30);

      // Verify agent classes extracted
      const astList = re.asTList();
      const classes = astList.flatMap((a) => nodesOfKind(a, 'class'));
      expect(classes.length).toBeGreaterThan(10);
      expect(classes.some((c) => c.name.toLowerCase().includes('agent') || c.name.toLowerCase().includes('context'))).toBe(true);
    });

    it('should compile PIM and generate diagrams for LexiMind complex multi-agent system', () => {
      engine.refresh();
      const pim = engine.getPIM();
      expect(pim).toBeDefined();
      expect(pim.entities().length).toBeGreaterThan(15);

      // Generate C4 Container diagram
      const c4Result = PimToDiagramAdapter.generate(pim, 'c4-container');
      expect(c4Result.plan.nodes.length).toBeGreaterThanOrEqual(3);

      // Generate API topology diagram
      const apiResult = PimToDiagramAdapter.generate(pim, 'api');
      expect(apiResult.plan.nodes.length).toBeGreaterThan(2);

      // Generate Architecture diagram
      const archResult = PimToDiagramAdapter.generate(pim, 'architecture');
      expect(archResult.plan.nodes.length).toBeGreaterThan(3);
    });

    it('should execute LexiMind Security and Review missions with agents', async () => {
      const framework = new ExecutionFramework();
      const historyStore = new InMemoryMissionHistoryStore();
      const coordinator = new MissionCoordinator(framework, historyStore);

      const pim = engine.getPIM();
      const knowledgeTool = new KnowledgeQueryTool({ pim });
      const searchTool = new RepositorySearchTool({ files: appFiles });
      const astTool = new ASTInspectTool({ astList: re.asTList() });

      const repoAgent = new RepositoryAgent({ tools: [searchTool, astTool] });
      const secAgent = new SecurityAgent({ tools: [knowledgeTool, searchTool] });

      framework.execution.register(repoAgent);
      framework.execution.register(secAgent);

      const mission: Mission = {
        id: 'leximind_security_audit',
        type: 'security_audit',
        goal: 'Audit LexiMind multi-agent architecture and security parameters',
        priority: 'high',
        riskLevel: 'high',
        strategy: 'sequential',
        constraints: {},
        successCriteria: [
          { id: 'repo_analysis_crit', description: 'Scan code files', checked: false },
          { id: 'security_scan_crit', description: 'Analyze security vulnerabilities', checked: false },
        ],
        requiredOutputs: ['reports', 'reviews'],
        status: 'created',
        progress: 0,
        objectives: [
          { id: 'repo_analysis', name: 'Scan repository', description: 'Scan code files', status: 'pending' },
          { id: 'security_scan', name: 'Security Audit', description: 'Evaluate security and credential handling', status: 'pending', dependsOn: ['repo_analysis'] },
        ],
        artifacts: [],
      };

      const execContext = new ExecutionContext({
        taskId: 't-leximind-sec',
        sessionId: 's-leximind-sec',
        userGoal: 'Audit security in LexiMind',
        permissions: ['*'],
        metadata: {
          inputData: {
            targetComponent: 'agents',
            query: 'token',
            targetFile: 'backend/app/agents/api.py',
            serviceName: 'agents',
          },
        },
      });

      const missionContext = new MissionContext(mission, execContext);
      const result = await coordinator.run(missionContext);

      expect(result.success).toBe(true);
      expect(result.reports.length).toBeGreaterThan(0);
      expect(mission.status).toBe('completed');
      expect(mission.progress).toBe(1.0);
    });
  });
});
