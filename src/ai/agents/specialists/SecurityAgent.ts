import { z } from 'zod';
import { BaseSpecialistAgent } from './BaseSpecialistAgent';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext } from '../contracts/AgentContract';

export class SecurityAgent extends BaseSpecialistAgent {
  readonly manifest: AgentManifest = {
    id: 'security-agent',
    name: 'Security Auditor',
    description: 'Scans source files and dependencies to find security vulnerabilities and issue remediation steps.',
    version: '1.0.0',
    type: 'agent',
    capabilities: ['security:scan', 'security:audit'],
    requiredContext: ['code', 'pim'],
    supportedTools: ['repository:search'],
    permissions: ['read:code', 'read:pim'],
    inputSchema: z.object({
      targetComponent: z.string().optional(),
    }),
    outputSchema: z.object({
      vulnerabilities: z.array(
        z.object({
          severity: z.enum(['low', 'medium', 'high', 'critical']),
          description: z.string(),
          path: z.string().optional(),
          remediation: z.string(),
        })
      ),
    }),
    costMetadata: {
      inputTokenCostPerMillion: 3.5,
      outputTokenCostPerMillion: 15.0,
    },
    latencyMetadata: {
      expectedP50Ms: 1800,
      expectedP95Ms: 4500,
    },
    supportedModels: ['claude-3-opus', 'gemini-1.5-pro'],
    healthStatus: 'healthy',
  };

  protected async runAgentLogic(context: AgentContext): Promise<any> {
    const mockData = context.executionContext.metadata.mockAgentResponse?.[this.id];
    if (mockData) {
      return mockData;
    }

    await this.invokeTool('repository:search', { query: 'password|secret|api_key|token' }, context.executionContext);

    const files = this.getRepoFiles(context.executionContext);
    const vulnerabilities: Array<{ severity: 'low' | 'medium' | 'high' | 'critical'; description: string; path?: string; remediation: string }> = [];
    const evidenceFiles: string[] = [];

    for (const f of files) {
      if (vulnerabilities.length >= 5) break;
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/(password|secret|token|api_key)\s*[:=]\s*["'][^"']{6,}["']/i.test(line) && !/example|placeholder|dummy|test/i.test(line)) {
          vulnerabilities.push({
            severity: 'high',
            description: 'Potential plaintext secret or credential detected in source code',
            path: `${f.path}:${i + 1}`,
            remediation: 'Extract credentials to environment variables or local secret storage',
          });
          evidenceFiles.push(f.path);
          break;
        } else if (/eval\s*\(|dangerouslySetInnerHTML/i.test(line)) {
          vulnerabilities.push({
            severity: 'critical',
            description: 'Unsafe code execution or DOM injection sink detected',
            path: `${f.path}:${i + 1}`,
            remediation: 'Avoid eval and direct innerHTML insertion; use safe parsers and DOM sanitization',
          });
          evidenceFiles.push(f.path);
          break;
        } else if (/http:\/\/[a-zA-Z0-9]/i.test(line) && !/localhost|127\.0\.0\.1|w3\.org/.test(line)) {
          vulnerabilities.push({
            severity: 'medium',
            description: 'Insecure unencrypted HTTP connection detected',
            path: `${f.path}:${i + 1}`,
            remediation: 'Enforce HTTPS transport encryption for all remote endpoints',
          });
          evidenceFiles.push(f.path);
          break;
        }
      }
    }

    if (vulnerabilities.length === 0) {
      const depFile = files.find((f) => /package\.json|requirements\.txt|pom\.xml/i.test(f.path))?.path || (files[0]?.path || 'package.json');
      vulnerabilities.push({
        severity: 'low',
        description: 'Dependency manifest requires automated vulnerability auditing',
        path: depFile,
        remediation: 'Run npm audit / safety check in CI pipeline to verify transitive dependencies',
      });
      evidenceFiles.push(depFile);
    }

    return {
      data: {
        vulnerabilities,
      },
      evidence: evidenceFiles.slice(0, 3).map((f) => ({
        source: f,
        origin: 'code',
        confidence: 0.95,
        method: 'static-analysis',
      })),
      confidence: 0.95,
      recommendations: ['Integrate automated secret detection pre-commit hooks and dependency audits'],
    };
  }
}
