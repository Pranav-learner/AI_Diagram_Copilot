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
});
