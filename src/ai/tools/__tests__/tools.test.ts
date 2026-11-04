import { describe, it, expect } from 'vitest';
import { createDefaultToolRegistry } from '../defaultTools';
import { ExecutionContext } from '../../execution/ExecutionContext';
import { ProjectIntelligenceModel } from '../../project-intelligence/pim/ProjectIntelligenceModel';
import { ReverseEngineeringEngine } from '../../reverse-engineering/ReverseEngineeringEngine';

describe('AI Tools Registry and Implementations', () => {
  it('registers all 3 default tools', () => {
    const registry = createDefaultToolRegistry();
    expect(registry.has('knowledge:query')).toBe(true);
    expect(registry.has('repository:search')).toBe(true);
    expect(registry.has('ast:inspect')).toBe(true);
  });

  it('KnowledgeQueryTool queries entities and blast radius', async () => {
    const registry = createDefaultToolRegistry();
    const pim = new ProjectIntelligenceModel({
      entities: [
        {
          id: 'auth-svc',
          name: 'AuthService',
          kind: 'service' as const,
          ontologyType: 'Service',
          category: 'architecture' as const,
          aliases: [],
          tags: ['security'],
          confidence: 0.95,
          evidence: [],
          sourceKinds: ['code' as const],
          attributes: {},
          pkmIds: [],
        },
      ],
      relations: [],
      conflicts: [],
      pkmToPim: new Map(),
      version: 1,
    });

    const ctx = new ExecutionContext({
      taskId: 't1',
      sessionId: 's1',
      userGoal: 'test',
      permissions: ['read:pim'],
      metadata: { pim },
    });

    const result = await registry.executeTool('knowledge:query', { query: 'Auth' }, ctx);
    expect(result.success).toBe(true);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('AuthService');
  });

  it('RepositorySearchTool searches files without code execution', async () => {
    const registry = createDefaultToolRegistry();
    const files = [
      { path: 'src/main.py', content: 'def start_server():\n    print("Running")' },
    ];

    const ctx = new ExecutionContext({
      taskId: 't2',
      sessionId: 's2',
      userGoal: 'search',
      permissions: ['read:repo'],
      metadata: { files },
    });

    const result = await registry.executeTool('repository:search', { query: 'start_server' }, ctx);
    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].path).toBe('src/main.py');
  });

  it('ASTInspectTool inspects parsed source ASTs', async () => {
    const registry = createDefaultToolRegistry();
    const reEngine = new ReverseEngineeringEngine();
    reEngine.addFile('src/models.py', 'class User:\n    pass\n\ndef get_user():\n    pass');

    const ctx = new ExecutionContext({
      taskId: 't3',
      sessionId: 's3',
      userGoal: 'inspect',
      permissions: ['read:ast'],
      metadata: { reEngine },
    });

    const result = await registry.executeTool('ast:inspect', { path: 'src/models.py', target: 'all' }, ctx);
    expect(result.success).toBe(true);
    expect(result.language).toBe('python');
    expect(result.classes).toBeDefined();
    expect(result.classes.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces permission checks', async () => {
    const registry = createDefaultToolRegistry();
    const ctx = new ExecutionContext({
      taskId: 't4',
      sessionId: 's4',
      userGoal: 'unauthorized',
      permissions: [], // no permissions
    });

    await expect(registry.executeTool('knowledge:query', {}, ctx)).rejects.toThrow('Permission denied');
  });
});

