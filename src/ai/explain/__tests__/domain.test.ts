import { describe, it, expect } from 'vitest';
import { buildSemanticGraph } from '@/ai';
import { detectDomain, defaultStyleForDomain, domainLabel } from '../domain';
import { architecture, makeModel } from './helpers';

describe('detectDomain', () => {
  it('detects software architecture', () => {
    const { doc } = architecture();
    expect(detectDomain(buildSemanticGraph(doc))).toBe('software-architecture');
  });

  it('detects an ER / data model', () => {
    const model = makeModel();
    model.createNode({ type: 'shape', semantic: 'entity', label: { text: 'Customer' } });
    model.createNode({ type: 'shape', semantic: 'entity', label: { text: 'Order' } });
    model.createNode({ type: 'shape', semantic: 'class', label: { text: 'Address' } });
    expect(detectDomain(buildSemanticGraph(model.document))).toBe('er-diagram');
  });

  it('detects a state machine', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape', semantic: 'state', label: { text: 'Idle' } });
    const b = model.createNode({ type: 'shape', semantic: 'state', label: { text: 'Running' } });
    model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'transition' } });
    expect(detectDomain(buildSemanticGraph(model.document))).toBe('state-machine');
  });

  it('detects a flowchart', () => {
    const model = makeModel();
    const start = model.createNode({ type: 'shape', semantic: 'start', label: { text: 'Start' } });
    const decide = model.createNode({ type: 'shape', semantic: 'decision', label: { text: 'Valid?' } });
    const proc = model.createNode({ type: 'shape', semantic: 'process', label: { text: 'Handle' } });
    model.createEdge({ source: { nodeId: start.id }, target: { nodeId: decide.id } });
    model.createEdge({ source: { nodeId: decide.id }, target: { nodeId: proc.id } });
    expect(detectDomain(buildSemanticGraph(model.document))).toBe('flowchart');
  });

  it('returns generic for an empty diagram', () => {
    expect(detectDomain(buildSemanticGraph(makeModel().document))).toBe('generic');
  });

  it('maps domains to a default style and label', () => {
    expect(defaultStyleForDomain('business-workflow')).toBe('business');
    expect(defaultStyleForDomain('mind-map')).toBe('educational');
    expect(defaultStyleForDomain('software-architecture')).toBe('technical');
    expect(domainLabel('er-diagram')).toMatch(/entity-relationship/);
  });
});
