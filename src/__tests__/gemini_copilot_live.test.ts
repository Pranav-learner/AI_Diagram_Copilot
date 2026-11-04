import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReverseEngineeringEngine,
  ProjectIntelligenceEngine,
  GeminiProvider,
} from '../ai';

function walkDir(dir: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === '.git' || item === '__pycache__' || item.endsWith('.pyc') || item === 'node_modules') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      try {
        const content = fs.readFileSync(full, 'utf8');
        results.push({ path: full, content });
      } catch {}
    }
  }
  return results;
}

describe('Live Gemini Copilot Q&A Verification on small_start_python', () => {
  const envContent = fs.existsSync('backend/.env') ? fs.readFileSync('backend/.env', 'utf8') : '';
  const keyMatch = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
  const apiKey = keyMatch ? keyMatch[1].trim() : process.env.GEMINI_API_KEY || '';

  it('should compile PIM and query live Gemini 2.5 Flash with source evidence', async () => {
    if (!apiKey || !process.env.TEST_LIVE_AI) {
      console.warn('Skipping live Gemini test (set TEST_LIVE_AI=1 and provide valid key to run online)');
      return;
    }

    const repoPath = path.resolve(process.cwd(), 'test_repos/small_start_python');
    const files = walkDir(repoPath);

    const engine = new ProjectIntelligenceEngine();
    const re = new ReverseEngineeringEngine({ pkm: engine.knowledge() });

    for (const f of files) {
      const rel = path.relative(repoPath, f.path);
      re.addFile(rel, f.content);
    }

    engine.refresh();
    const pim = engine.getPIM();
    const entities = pim.entities();
    const relations = pim.relations();

    const provider = new GeminiProvider({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com',
    });

    const entitiesSummary = entities
      .slice(0, 15)
      .map((e) => `- ${e.name} (${e.ontologyType || e.kind}): ${e.description || 'Core entity'}`)
      .join('\n');

    const relationsSummary = relations
      .slice(0, 20)
      .map((r) => `- ${r.source} -> [${r.kind}] -> ${r.target}`)
      .join('\n');

    const systemPrompt = `You are the AI Project Intelligence Copilot analyzing the repository "small_start_python".
Grounded PIM Digital Twin Entities:
${entitiesSummary}

Architecture Relationships:
${relationsSummary}

Answer questions with technical precision and cite verified files (such as main.py, app/routers/tasks.py, app/services/task_service.py).`;

    const questions = [
      'What is the entry point of this project and what framework does it use?',
      'What are the primary workflow layers from routers down to database repositories?',
    ];

    for (const q of questions) {
      const resp = await provider.complete({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: q },
        ],
        temperature: 0.1,
        maxTokens: 500,
      });

      expect(resp.text.length).toBeGreaterThan(50);
      expect(resp.provider).toBe('gemini');
      expect(resp.model).toBe('gemini-2.5-flash');
      console.log(`[Copilot Answer for "${q}"]:\n`, resp.text);
    }
  }, 30000);
});
