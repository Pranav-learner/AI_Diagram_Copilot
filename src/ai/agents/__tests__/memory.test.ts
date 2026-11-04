import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentMemory,
  InMemoryAgentMemoryStore,
} from '../memory/AgentMemory';

describe('AgentMemory — Mission Scoping, Context Handoff & Persistence', () => {
  let memory: AgentMemory;
  let store: InMemoryAgentMemoryStore;

  beforeEach(() => {
    store = new InMemoryAgentMemoryStore();
    memory = new AgentMemory(store);
  });

  describe('Mission-Scoped Memory Isolation', () => {
    it('isolates data between different missions', () => {
      memory.set('mission-1', 'arch_style', 'Layered');
      memory.set('mission-2', 'arch_style', 'Event-Driven');

      expect(memory.get('mission-1', 'arch_style')).toBe('Layered');
      expect(memory.get('mission-2', 'arch_style')).toBe('Event-Driven');

      expect(memory.has('mission-1', 'arch_style')).toBe(true);
      expect(memory.has('mission-3', 'arch_style')).toBe(false);
    });

    it('clears specific mission without affecting others', () => {
      memory.set('m1', 'k1', 'val1');
      memory.set('m2', 'k2', 'val2');

      memory.clear('m1');
      expect(memory.get('m1', 'k1')).toBeUndefined();
      expect(memory.get('m2', 'k2')).toBe('val2');
    });

    it('searches entries by tag and prefix within mission scope', () => {
      memory.set('m1', 'layer:api', { name: 'API' }, { tags: ['layer', 'public'] });
      memory.set('m1', 'layer:domain', { name: 'Domain' }, { tags: ['layer', 'internal'] });
      memory.set('m1', 'config:env', 'production', { tags: ['config'] });

      const layerEntries = memory.search('m1', { tag: 'layer' });
      expect(layerEntries).toHaveLength(2);

      const prefixEntries = memory.search('m1', { keyPrefix: 'layer:' });
      expect(prefixEntries).toHaveLength(2);

      const emptyQuery = memory.search('m2', { tag: 'layer' });
      expect(emptyQuery).toHaveLength(0);
    });
  });

  describe('Context Handoff (Upstream -> Downstream Agents)', () => {
    it('supports pipeline handoff: Architecture -> Security -> Reviewer -> Documentation', () => {
      const missionId = 'mission-pipeline-1';

      // 1. ArchitectureAgent runs and hands off to Security & Reviewer
      memory.recordHandoff({
        missionId,
        fromAgentId: 'architecture-agent',
        toAgentId: 'security-agent',
        summary: 'Identified public API Gateway and payment service',
        findings: {
          style: 'Microservices',
          criticalComponents: ['Gateway', 'PaymentService'],
        },
        evidence: [{ source: 'src/gateway.ts', confidence: 0.98 }],
      });

      // 2. SecurityAgent receives architecture context and performs audit
      const secContext = memory.getHandoffContextForAgent(missionId, 'security-agent');
      expect(secContext['architecture-agent']).toBeDefined();
      expect(secContext['architecture-agent'].findings.criticalComponents).toContain('PaymentService');

      // SecurityAgent hands off findings to ReviewerAgent
      memory.recordHandoff({
        missionId,
        fromAgentId: 'security-agent',
        toAgentId: 'reviewer-agent',
        summary: 'Found unencrypted HTTP in PaymentService',
        findings: {
          vulnerabilities: [{ file: 'src/payment.ts', severity: 'high' }],
        },
        evidence: [{ source: 'src/payment.ts', confidence: 0.95 }],
      });

      // 3. ReviewerAgent receives security findings
      const revContext = memory.getHandoffContextForAgent(missionId, 'reviewer-agent');
      expect(revContext['security-agent']).toBeDefined();
      expect(revContext['security-agent'].findings.vulnerabilities[0].file).toBe('src/payment.ts');

      // Reviewer hands off to DocumentationAgent
      memory.recordHandoff({
        missionId,
        fromAgentId: 'reviewer-agent',
        toAgentId: 'documentation-agent',
        summary: 'Code review approved with HTTPS enforcement required',
        findings: {
          approved: true,
          remediationNotes: ['Enforce TLS 1.3 on PaymentService'],
        },
        evidence: [{ source: 'src/payment.ts', confidence: 0.94 }],
      });

      // 4. DocumentationAgent receives review recommendations
      const docContext = memory.getHandoffContextForAgent(missionId, 'documentation-agent');
      expect(docContext['reviewer-agent']).toBeDefined();
      expect(docContext['reviewer-agent'].findings.remediationNotes).toContain('Enforce TLS 1.3 on PaymentService');
    });

    it('filters handoffs by sender or receiver', () => {
      const missionId = 'm-filter';
      memory.recordHandoff({
        missionId,
        fromAgentId: 'agent-A',
        toAgentId: 'agent-B',
        summary: 'A to B',
        findings: {},
        evidence: [],
      });
      memory.recordHandoff({
        missionId,
        fromAgentId: 'agent-A',
        toAgentId: 'agent-C',
        summary: 'A to C',
        findings: {},
        evidence: [],
      });

      const onlyB = memory.getHandoffs(missionId, { toAgentId: 'agent-B' });
      expect(onlyB).toHaveLength(1);
      expect(onlyB[0].summary).toBe('A to B');

      const allFromA = memory.getHandoffs(missionId, { fromAgentId: 'agent-A' });
      expect(allFromA).toHaveLength(2);
    });
  });

  describe('State Persistence & Snapshot Export', () => {
    it('persists and restores mission memory via AgentMemoryStore', async () => {
      const missionId = 'persist-mission-1';
      memory.set(missionId, 'summary', 'Analysis completed');
      memory.recordHandoff({
        missionId,
        fromAgentId: 'arch',
        toAgentId: 'sec',
        summary: 'Arch to Sec',
        findings: { ok: true },
        evidence: [],
      });

      // Save to store
      await memory.save(missionId);

      // Create a fresh memory instance and restore
      const freshMemory = new AgentMemory(store);
      const loaded = await freshMemory.load(missionId);
      expect(loaded).toBe(true);

      expect(freshMemory.get(missionId, 'summary')).toBe('Analysis completed');
      const handoffs = freshMemory.getHandoffs(missionId);
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0].summary).toBe('Arch to Sec');
    });

    it('exports and imports state snapshots cleanly', () => {
      const missionId = 'snap-1';
      memory.set(missionId, 'keyA', 'valA');

      const snapshot = memory.exportState(missionId);
      expect(snapshot.missionId).toBe(missionId);
      expect(snapshot.entries['keyA'].value).toBe('valA');

      const freshMemory = new AgentMemory();
      freshMemory.importState(snapshot);
      expect(freshMemory.get(missionId, 'keyA')).toBe('valA');
    });
  });
});

