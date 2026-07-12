import { describe, it, expect } from 'vitest';
import { understandDiagram, renderUnderstanding } from '../DiagramUnderstanding';
import { ReferenceResolver } from '../ReferenceResolver';
import { DiagramModel } from '@/dsl';
import { sampleDiagram, contextSource, understanding } from './helpers';

describe('DiagramUnderstanding', () => {
  it('captures nodes, edges, roles, positions, and selection', () => {
    const { doc, ids } = sampleDiagram();
    const u = understandDiagram(contextSource(doc, [ids.api!]));
    expect(u.counts.nodes).toBe(4);
    expect(u.counts.edges).toBe(1);
    const api = u.nodes.find((n) => n.label === 'API')!;
    expect(api.role).toBe('api');
    expect(api.selected).toBe(true);
    expect(u.edges[0]!.sourceLabel).toBe('API');
    expect(u.edges[0]!.targetLabel).toBe('Database');
  });

  it('computes group membership + bounds', () => {
    const model = DiagramModel.create();
    const a = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'A' }, position: { x: 0, y: 0 } });
    const b = model.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'B' }, position: { x: 100, y: 0 } });
    const g = model.createGroup({ name: 'Auth', childIds: [a.id, b.id] });
    const u = understandDiagram(contextSource(model.document));
    const group = u.groups.find((gr) => gr.id === g.id)!;
    expect(group.label).toBe('Auth');
    expect(group.memberIds).toEqual([a.id, b.id]);
    expect(u.nodes.find((n) => n.id === a.id)!.groupId).toBe(g.id);
  });

  it('renders a fenced JSON block exposing ids', () => {
    const { doc } = sampleDiagram();
    const rendered = renderUnderstanding(understandDiagram(contextSource(doc)));
    expect(rendered.startsWith('```json')).toBe(true);
    expect(rendered).toContain('"label":"API"');
  });
});

describe('ReferenceResolver', () => {
  const { doc, ids } = sampleDiagram();

  it('resolves by id and by label', () => {
    const r = new ReferenceResolver(understanding(doc));
    expect(r.resolve({ by: 'id', id: ids.api! }, 'node').ids).toEqual([ids.api]);
    expect(r.resolve({ by: 'label', label: 'Database' }, 'node').ids).toEqual([ids.db]);
  });

  it('resolves the selection', () => {
    const r = new ReferenceResolver(understanding(doc, [ids.auth!, ids.catalog!]));
    expect(new Set(r.resolve({ by: 'selection' }, 'node').ids)).toEqual(new Set([ids.auth, ids.catalog]));
    expect(r.resolve({ by: 'selection', index: 0 }, 'node').ids).toEqual([ids.auth]);
  });

  it('resolves a `new` ref from the plan-local map', () => {
    const r = new ReferenceResolver(understanding(doc), new Map([['redis', 'node-redis']]));
    expect(r.resolve({ by: 'new', ref: 'redis' }, 'node').ids).toEqual(['node-redis']);
  });

  it('is ambiguous for a descriptor matching multiple elements', () => {
    const r = new ReferenceResolver(understanding(doc));
    const res = r.resolve({ by: 'descriptor', text: 'service' }, 'node');
    expect(res.ids.length).toBe(2); // Auth Service + Catalog Service
    expect(res.candidates.map((c) => c.label).sort()).toEqual(['Auth Service', 'Catalog Service']);
  });

  it('resolves superlatives (largest, bottommost)', () => {
    const r = new ReferenceResolver(understanding(doc));
    // Catalog Service is widest (200x60=12000) vs Database (160x80=12800) → Database largest.
    expect(r.resolve({ by: 'superlative', metric: 'largest' }, 'node').ids).toEqual([ids.db]);
    expect(r.resolve({ by: 'superlative', metric: 'bottommost' }, 'node').ids).toEqual([ids.db]);
  });

  it('returns nothing for an unknown reference', () => {
    const r = new ReferenceResolver(understanding(doc));
    expect(r.resolve({ by: 'label', label: 'Kafka' }, 'node').ids).toEqual([]);
  });
});
