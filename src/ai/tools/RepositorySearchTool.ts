import { z } from 'zod';
import type { Tool } from './Tool';
import type { ExecutionContext } from '../execution/ExecutionContext';
import type { ReverseEngineeringEngine } from '../reverse-engineering/ReverseEngineeringEngine';

export const RepositorySearchInputSchema = z.object({
  query: z.string().min(1),
  type: z.enum(['symbol', 'file', 'class', 'method', 'text']).default('symbol'),
  pathPattern: z.string().optional(),
  limit: z.number().min(1).max(50).default(15),
});

export type RepositorySearchInput = z.infer<typeof RepositorySearchInputSchema>;

export class RepositorySearchTool implements Tool {
  readonly id = 'repository:search';
  readonly name = 'Repository Search Tool';
  readonly description = 'Searches imported repository source code and symbols without code execution.';
  readonly permissionsRequired = ['read:repo'];
  readonly inputSchema = RepositorySearchInputSchema;

  async execute(args: RepositorySearchInput, context: ExecutionContext): Promise<any> {
    const reEngine: ReverseEngineeringEngine | undefined = context.metadata.reEngine;
    const files: Array<{ path: string; content: string }> | undefined = context.metadata.files;

    const { query, type, pathPattern, limit } = args;
    const lowerQuery = query.toLowerCase();
    const matches: Array<{
      path: string;
      symbol?: string;
      kind?: string;
      line?: number;
      snippet: string;
      provenance: string;
    }> = [];

    // 1. Search via ReverseEngineeringEngine AST Graph if present
    if (reEngine && typeof reEngine.search === 'function') {
      const graphHits = reEngine.search({
        text: query,
        limit,
        kind: type === 'class' ? 'class' : undefined,
      });

      for (const hit of graphHits) {
        const filePath = hit.file || '';
        if (pathPattern && !filePath.includes(pathPattern)) continue;
        matches.push({
          path: filePath,
          symbol: hit.name,
          kind: hit.kind,
          line: 1,
          snippet: hit.qualifiedName || `Declared ${hit.kind} ${hit.name}`,
          provenance: 'AST Parse',
        });
      }
    }

    // 2. Fallback or textual search across files
    if (matches.length < limit && files && files.length > 0) {
      for (const file of files) {
        if (pathPattern && !file.path.includes(pathPattern)) continue;
        if (matches.length >= limit) break;

        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.toLowerCase().includes(lowerQuery)) {
            matches.push({
              path: file.path,
              line: i + 1,
              snippet: line.trim().slice(0, 160),
              provenance: 'File Scan',
            });
            if (matches.length >= limit) break;
          }
        }
      }
    }

    return {
      success: true,
      query,
      searchType: type,
      totalFound: matches.length,
      matches,
    };
  }
}

