/**
 * Shared helpers for the generation test suite.
 */

import type { AIProvider } from '../../core/AIProvider';
import { AIService } from '../../core/AIService';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { mergeConfig } from '../../core/AIConfig';
import { MockProvider } from '../../providers/MockProvider';
import { MockPlanProvider } from '../MockPlanProvider';
import type { DiagramGateway, OperationApplyResult } from '../../planning/OperationPlanner';
import type { OperationPlan } from '../../validation/schemas/operationPlan';
import { createDefaultOperationRegistry } from '@/diagram-engine';
import type { DiagramPlan } from '../model/DiagramPlan';

const KNOWN_TYPES = createDefaultOperationRegistry().types();

/** An AIService backed by a specific provider (defaults to the heuristic plan provider). */
export function generationService(provider: AIProvider = new MockPlanProvider()): AIService {
  const registry = new ProviderRegistry().register(provider);
  return new AIService({ registry, config: mergeConfig({ provider: provider.id }) });
}

/** An AIService that returns exact canned JSON strings in order (for schema/validation tests). */
export function scriptedService(...replies: string[]): AIService {
  const provider = new MockProvider({ id: 'scripted', replies });
  const registry = new ProviderRegistry().register(provider);
  return new AIService({ registry, config: mergeConfig({ provider: 'scripted' }) });
}

/** A gateway that records applied plans and knows the real runtime operation types. */
export function recordingGateway(): DiagramGateway & { plans: OperationPlan[] } {
  const plans: OperationPlan[] = [];
  return {
    plans,
    knownOperationTypes: () => KNOWN_TYPES,
    apply(plan): OperationApplyResult {
      plans.push(plan);
      return { applied: plan.operations.length, version: plans.length };
    },
  };
}

/** A minimal valid plan for tests that need a hand-built one. */
export function samplePlan(overrides: Partial<DiagramPlan> = {}): DiagramPlan {
  return {
    diagramType: 'flowchart',
    title: 'Test',
    nodes: [
      { id: 'a', label: 'A', type: 'start' },
      { id: 'b', label: 'B', type: 'process' },
      { id: 'c', label: 'C', type: 'end' },
    ],
    relationships: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
    confidence: 0.9,
    ...overrides,
  } as DiagramPlan;
}
