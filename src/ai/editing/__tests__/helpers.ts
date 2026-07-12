/**
 * Shared helpers for the editing test suite.
 */

import { DiagramModel } from '@/dsl';
import type { DiagramDocument } from '@/dsl';
import { createDefaultOperationRegistry } from '@/diagram-engine';
import type { AIProvider } from '../../core/AIProvider';
import { AIService } from '../../core/AIService';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { MockProvider } from '../../providers/MockProvider';
import { mergeConfig } from '../../core/AIConfig';
import type { DiagramContextSource } from '../../planning/ContextBuilder';
import type { DiagramGateway, OperationApplyResult } from '../../planning/OperationPlanner';
import type { OperationPlan } from '../../validation/schemas/operationPlan';
import { understandDiagram } from '../DiagramUnderstanding';
import type { DiagramUnderstanding } from '../DiagramUnderstanding';
import { MockEditProvider } from '../MockEditProvider';

const KNOWN_TYPES = createDefaultOperationRegistry().types();

export interface SampleDiagram {
  readonly doc: DiagramDocument;
  readonly ids: Readonly<Record<string, string>>;
}

/** A small architecture diagram: API → Database, plus Auth/Catalog services. */
export function sampleDiagram(): SampleDiagram {
  const model = DiagramModel.create({ name: 'Sample' });
  const api = model.createNode({ type: 'shape', shape: 'hexagon', semantic: 'api', label: { text: 'API' }, position: { x: 0, y: 0 }, size: { width: 160, height: 60 } });
  const db = model.createNode({ type: 'shape', shape: 'cylinder', semantic: 'database', label: { text: 'Database' }, position: { x: 0, y: 200 }, size: { width: 160, height: 80 } });
  const auth = model.createNode({ type: 'shape', shape: 'roundedRectangle', semantic: 'service', label: { text: 'Auth Service' }, position: { x: 250, y: 0 }, size: { width: 180, height: 60 } });
  const catalog = model.createNode({ type: 'shape', shape: 'roundedRectangle', semantic: 'service', label: { text: 'Catalog Service' }, position: { x: 250, y: 120 }, size: { width: 200, height: 60 } });
  model.createEdge({ source: { nodeId: api.id }, target: { nodeId: db.id }, label: { text: 'reads' } });
  return { doc: model.document, ids: { api: api.id, db: db.id, auth: auth.id, catalog: catalog.id } };
}

/** A context source over a fixed document + selection. */
export function contextSource(doc: DiagramDocument, selection: string[] = []): DiagramContextSource {
  return { getDocument: () => doc, getSelection: () => selection };
}

export function understanding(doc: DiagramDocument, selection: string[] = []): DiagramUnderstanding {
  return understandDiagram(contextSource(doc, selection));
}

/** An AIService backed by the heuristic edit provider (context-aware). */
export function editingService(provider: AIProvider = new MockEditProvider()): AIService {
  const registry = new ProviderRegistry().register(provider);
  return new AIService({ registry, config: mergeConfig({ provider: provider.id }) });
}

/** An AIService that returns exact canned EditPlan JSON strings in order. */
export function scriptedService(...replies: string[]): AIService {
  const registry = new ProviderRegistry().register(new MockProvider({ id: 'scripted', replies }));
  return new AIService({ registry, config: mergeConfig({ provider: 'scripted' }) });
}

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
