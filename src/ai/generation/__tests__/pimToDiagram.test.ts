import { describe, it, expect } from 'vitest';
import { ProjectIntelligenceModel } from '../../project-intelligence/pim/ProjectIntelligenceModel';
import { pimToDiagramPlan } from '../model/PimToDiagramAdapter';
import { DiagramGenerator } from '../DiagramGenerator';
import { createAIService } from '../../core/factory';
import type { DiagramGateway } from '../../planning/OperationPlanner';

describe('PimToDiagramAdapter', () => {
  it('converts PIM entities and relationships into a DiagramPlan without private member access', () => {
    const entities = [
      {
        id: 'srv-1',
        name: 'UserService',
        kind: 'service' as const,
        ontologyType: 'Service',
        category: 'architecture' as const,
        aliases: [],
        tags: ['backend'],
        confidence: 0.95,
        evidence: [],
        sourceKinds: ['code' as const],
        attributes: {},
        pkmIds: [],
      },
      {
        id: 'db-1',
        name: 'UserDB',
        kind: 'database' as const,
        ontologyType: 'Database',
        category: 'data' as const,
        aliases: [],
        tags: ['postgres'],
        confidence: 0.9,
        evidence: [],
        sourceKinds: ['infra' as const],
        attributes: {},
        pkmIds: [],
      },
    ];
    const relations = [
      {
        id: 'rel-1',
        source: 'srv-1',
        target: 'db-1',
        kind: 'dependsOn' as const,
        confidence: 0.95,
        evidence: [],
      },
    ];
    const pim = new ProjectIntelligenceModel({
      entities,
      relations,
      conflicts: [],
      pkmToPim: new Map(),
      version: 1,
    });

    const plan = pimToDiagramPlan(pim, { viewType: 'architecture' });
    expect(plan.nodes).toHaveLength(2);
    expect(plan.relationships).toHaveLength(1);
    expect(plan.relationships[0]?.source).toBe('srv-1');
    expect(plan.relationships[0]?.target).toBe('db-1');
    expect(plan.relationships[0]?.type).toBe('dependency');

    // Test applyPlan public API on DiagramGenerator
    const { service } = createAIService();
    const appliedOps: any[] = [];
    const gateway: DiagramGateway = {
      apply: (plan) => {
        appliedOps.push(...plan.operations);
        return { ok: true, applied: plan.operations.length, summary: 'Applied' };
      },
      knownOperationTypes: () => [
        'node.create',
        'edge.connect',
        'document.metadata',
        'viewport.set',
        'group.create',
      ],
    };

    const generator = new DiagramGenerator({ service, gateway });
    const result = generator.applyPlan(plan);

    expect(result.plan.nodes).toHaveLength(2);
    expect(result.applied.ok).toBe(true);
    expect(appliedOps.length).toBeGreaterThan(0);
  });

  it('generates a clean 5-tier architecture plan for realistic python repo entities', () => {
    const rawEntities = [
      { id: 'pim:main', name: 'main', kind: 'component' as const, ontologyType: 'SoftwareComponent', category: 'architecture' as const, aliases: [], tags: [], confidence: 0.98, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:fastapi', name: 'fastapi', kind: 'component' as const, ontologyType: 'SoftwareComponent', category: 'architecture' as const, aliases: [], tags: [], confidence: 0.98, evidence: [], sourceKinds: ['package' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:pydantic', name: 'pydantic', kind: 'component' as const, ontologyType: 'SoftwareComponent', category: 'architecture' as const, aliases: [], tags: [], confidence: 0.98, evidence: [], sourceKinds: ['package' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:get-tasks', name: 'GET /api/v1/tasks', kind: 'endpoint' as const, ontologyType: 'API', category: 'api' as const, aliases: [], tags: [], confidence: 0.98, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:router-tasks', name: 'app.routers.tasks', kind: 'component' as const, ontologyType: 'SoftwareComponent', category: 'architecture' as const, aliases: [], tags: [], confidence: 0.98, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:task-service', name: 'app.services.task_service', kind: 'service' as const, ontologyType: 'Service', category: 'architecture' as const, aliases: [], tags: [], confidence: 0.95, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:task-repo', name: 'app.repositories.task_repository', kind: 'repository' as const, ontologyType: 'Repository', category: 'architecture' as const, aliases: [], tags: [], confidence: 0.95, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:task-model', name: 'app.models.task', kind: 'component' as const, ontologyType: 'Model', category: 'data' as const, aliases: [], tags: [], confidence: 0.95, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
      { id: 'pim:database', name: 'app.db.database', kind: 'database' as const, ontologyType: 'Database', category: 'data' as const, aliases: [], tags: [], confidence: 0.95, evidence: [], sourceKinds: ['code' as const], attributes: {}, pkmIds: [] },
    ];
    const rawRelations = [
      { id: 'r1', source: 'pim:main', target: 'pim:router-tasks', kind: 'contains' as const, confidence: 0.9, evidence: [] },
      { id: 'r2', source: 'pim:router-tasks', target: 'pim:task-service', kind: 'dependsOn' as const, confidence: 0.9, evidence: [] },
      { id: 'r3', source: 'pim:task-service', target: 'pim:task-repo', kind: 'dependsOn' as const, confidence: 0.9, evidence: [] },
      { id: 'r4', source: 'pim:task-repo', target: 'pim:database', kind: 'dependsOn' as const, confidence: 0.9, evidence: [] },
      { id: 'r5', source: 'pim:task-repo', target: 'pim:task-model', kind: 'dependsOn' as const, confidence: 0.9, evidence: [] },
    ];

    const pim = new ProjectIntelligenceModel({
      entities: rawEntities,
      relations: rawRelations,
      conflicts: [],
      pkmToPim: new Map(),
      version: 1,
    });

    const plan = pimToDiagramPlan(pim, { viewType: 'architecture' });
    // Expect third-party packages and micro-endpoints to be filtered out
    expect(plan.nodes.some((n) => n.id === 'pim:fastapi')).toBe(false);
    expect(plan.nodes.some((n) => n.id === 'pim:pydantic')).toBe(false);
    expect(plan.nodes.some((n) => n.id === 'pim:get-tasks')).toBe(false);

    // Expect core components to exist
    expect(plan.nodes.some((n) => n.id === 'pim:main')).toBe(true);
    expect(plan.nodes.some((n) => n.id === 'pim:router-tasks')).toBe(true);
    expect(plan.nodes.some((n) => n.id === 'pim:task-service')).toBe(true);
    expect(plan.nodes.some((n) => n.id === 'pim:task-repo')).toBe(true);
    expect(plan.nodes.some((n) => n.id === 'pim:database')).toBe(true);

    const { service } = createAIService();
    const appliedOps: any[] = [];
    const gateway: DiagramGateway = {
      apply: (p) => {
        appliedOps.push(...p.operations);
        return { ok: true, applied: p.operations.length, summary: 'Applied' };
      },
      knownOperationTypes: () => [
        'node.create',
        'edge.connect',
        'document.metadata',
        'viewport.set',
        'group.create',
      ],
    };

    const generator = new DiagramGenerator({ service, gateway });
    const result = generator.applyPlan(plan);
    expect(result.applied.ok).toBe(true);
    expect(result.applied.applied).toBeGreaterThan(0);
  });
});
