import { describe, it, expect } from 'vitest';
import { ExecutionContext } from '../../execution/ExecutionContext';
import { ReverseEngineeringEngine } from '../../reverse-engineering/ReverseEngineeringEngine';
import { ArchitectureAgent } from '../specialists/ArchitectureAgent';
import { BackendAgent } from '../specialists/BackendAgent';
import { DatabaseAgent } from '../specialists/DatabaseAgent';
import { SecurityAgent } from '../specialists/SecurityAgent';
import { RepositoryAgent } from '../specialists/RepositoryAgent';

describe('Specialist Agents with Real Repository Context', () => {
  it('extracts real architecture, components, and layers from real source files', async () => {
    const reEngine = new ReverseEngineeringEngine();
    reEngine.addFile('src/controllers/UserController.ts', 'export class UserController {}');
    reEngine.addFile('src/services/UserService.ts', 'export class UserService {}');
    reEngine.addFile('src/models/UserModel.ts', 'export class UserModel {}');

    const context = new ExecutionContext({
      taskId: 't-arch',
      sessionId: 's-arch',
      userGoal: 'Analyze real architecture',
      permissions: ['*'],
      metadata: {
        reEngine,
      },
    });

    const agent = new ArchitectureAgent();
    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    const data = (result.data as any).data;
    expect(data.layers).toContain('API / Controllers');
    expect(data.layers).toContain('Domain Services');
    expect(data.layers).toContain('Persistence & Data');

    const evidence = (result.data as any).evidence;
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.some((e: any) => e.source.includes('UserController.ts') || e.source.includes('UserService.ts'))).toBe(true);
  });

  it('detects real backend language, framework and routes', async () => {
    const files = [
      {
        path: 'src/main/java/com/example/demo/controller/AccountController.java',
        content: `
package com.example.demo.controller;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {
    @GetMapping("/balance")
    public BalanceDto getBalance() { return null; }
}
`,
      },
    ];

    const context = new ExecutionContext({
      taskId: 't-backend',
      sessionId: 's-backend',
      userGoal: 'Analyze backend routes',
      permissions: ['*'],
      metadata: {
        files,
        inputData: { serviceName: 'accounts' },
      },
    });

    const agent = new BackendAgent();
    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    const data = (result.data as any).data;
    expect(data.language).toBe('Java');
    expect(data.framework).toBe('Spring Boot');
    expect(data.endpoints.some((ep: any) => ep.path.includes('balance') || ep.path.includes('accounts'))).toBe(true);
  });

  it('detects security issues pointing to real source files and lines', async () => {
    const files = [
      {
        path: 'src/config/auth.ts',
        content: `
export const jwtSecret = "super_secret_hardcoded_jwt_token_123456";
export function evalInput(code: string) {
    return eval(code);
}
`,
      },
    ];

    const context = new ExecutionContext({
      taskId: 't-sec',
      sessionId: 's-sec',
      userGoal: 'Audit security vulnerabilities',
      permissions: ['*'],
      metadata: {
        files,
      },
    });

    const agent = new SecurityAgent();
    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    const data = (result.data as any).data;
    expect(data.vulnerabilities.length).toBeGreaterThan(0);
    expect(data.vulnerabilities.some((v: any) => v.path?.includes('src/config/auth.ts'))).toBe(true);
  });

  it('searches real repository files with RepositoryAgent', async () => {
    const files = [
      { path: 'src/app.py', content: 'def start_server():\n    print("Starting server")\n' },
      { path: 'src/config.py', content: 'PORT = 8080\n' },
    ];

    const context = new ExecutionContext({
      taskId: 't-repo',
      sessionId: 's-repo',
      userGoal: 'Search server entry',
      permissions: ['*'],
      metadata: {
        files,
        inputData: { query: 'start_server' },
      },
    });

    const agent = new RepositoryAgent();
    const result = await agent.execute(context);

    expect(result.success).toBe(true);
    const data = (result.data as any).data;
    expect(data.matchedFiles).toContain('src/app.py');
    expect(data.matchedCodeSnippets.some((s: any) => s.file === 'src/app.py' && s.snippet.includes('start_server'))).toBe(true);
  });
});

