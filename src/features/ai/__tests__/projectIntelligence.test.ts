import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectIntelligenceStore } from '../store/useProjectIntelligenceStore';

describe('useProjectIntelligenceStore', () => {
  beforeEach(() => {
    useProjectIntelligenceStore.getState().clearProject();
  });

  it('should initialize with default state', () => {
    const state = useProjectIntelligenceStore.getState();
    expect(state.activeTab).toBe('canvas');
    expect(state.importStatus).toBe('idle');
    expect(state.importProgress).toBe(0);
    expect(state.importLogs).toHaveLength(0);
    expect(state.pim).toBeNull();
    expect(state.engine).toBeNull();
  });

  it('should switch active tabs correctly', () => {
    const store = useProjectIntelligenceStore.getState();
    expect(store.activeTab).toBe('canvas');

    store.setActiveTab('intelligence');
    expect(useProjectIntelligenceStore.getState().activeTab).toBe('intelligence');

    store.setActiveTab('canvas');
    expect(useProjectIntelligenceStore.getState().activeTab).toBe('canvas');
  });

  it('should load a pre-packaged sample project and fuse PIM', async () => {
    const store = useProjectIntelligenceStore.getState();
    
    // Ingest ecommerce sample
    await store.loadSampleProject('ecommerce');

    const updatedState = useProjectIntelligenceStore.getState();
    expect(updatedState.importStatus).toBe('success');
    expect(updatedState.importProgress).toBe(100);
    expect(updatedState.activeProjectId).toBe('ecommerce');
    
    // Check that PIM model fused correctly and has entities
    expect(updatedState.pim).not.toBeNull();
    const entities = updatedState.pim!.entities();
    expect(entities.length).toBeGreaterThan(0);

    // Verify entity existence (e.g. gateway service)
    const gateway = entities.find(e => e.name === 'gateway');
    expect(gateway).toBeDefined();
    expect(gateway?.kind).toBe('service');

    // Verify relations (e.g. dependsOn relationship)
    const relations = updatedState.pim!.relations();
    expect(relations.length).toBeGreaterThan(0);
  });

  it('should handle custom file imports correctly', async () => {
    const store = useProjectIntelligenceStore.getState();

    const customFiles = [
      {
        path: 'docker-compose.yml',
        content: `
version: '3.8'
services:
  web:
    image: node:alpine
    ports:
      - "80:80"
    depends_on:
      - database
  database:
    image: postgres:15
        `
      }
    ];

    await store.importFiles(customFiles, 'custom-test-proj');

    const updatedState = useProjectIntelligenceStore.getState();
    expect(updatedState.importStatus).toBe('success');
    expect(updatedState.activeProjectId).toBe('custom-test-proj');
    expect(updatedState.pim).not.toBeNull();
    
    const entities = updatedState.pim!.entities();
    expect(entities.length).toBe(2);
    expect(entities.find(e => e.name === 'web')).toBeDefined();
    expect(entities.find(e => e.name === 'database')).toBeDefined();
  });

  it('should update query telemetry and session metrics', () => {
    const store = useProjectIntelligenceStore.getState();
    
    // Record first query
    store.recordQueryMetrics(150, 450, true, true);
    
    let metrics = useProjectIntelligenceStore.getState().sessionMetrics;
    expect(metrics.totalQueries).toBe(1);
    expect(metrics.avgLatency).toBe(150);
    expect(metrics.totalTokens).toBe(450);
    expect(metrics.cacheHitRate).toBe(100);

    // Record second query (cache miss)
    store.recordQueryMetrics(250, 550, true, false);

    metrics = useProjectIntelligenceStore.getState().sessionMetrics;
    expect(metrics.totalQueries).toBe(2);
    expect(metrics.avgLatency).toBe(200); // (150 + 250) / 2
    expect(metrics.totalTokens).toBe(1000); // 450 + 550
    expect(metrics.cacheHitRate).toBe(50); // 1 hit, 1 miss
  });
});
