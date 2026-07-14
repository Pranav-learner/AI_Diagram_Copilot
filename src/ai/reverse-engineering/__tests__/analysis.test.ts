import { describe, it, expect } from 'vitest';
import { defaultParserRegistry } from '../parsers';
import { buildCodeKnowledgeGraph } from '../analysis';
import type { NormalizedAST } from '../ast/NormalizedAST';
import { COMPOSE, SQL_SCHEMA } from './helpers';

const registry = defaultParserRegistry();
function graphOf(files: Array<{ path: string; content: string }>) {
  const asts = files.map((f) => registry.parse(f).ast).filter((a): a is NormalizedAST => !!a);
  return buildCodeKnowledgeGraph(asts);
}

describe('static analysis — code', () => {
  it('builds modules, containment, dependency, inheritance, and call edges', () => {
    const graph = graphOf([
      { path: 'src/base.ts', content: 'export class BaseService {}' },
      { path: 'src/user.service.ts', content: `import { BaseService } from './base';\nimport { z } from 'zod';\nexport class UserService extends BaseService {}\nexport function a() { b(); }\nexport function b() {}` },
    ]);
    const rels = graph.relations();

    // Inheritance across files.
    const userSvc = graph.entities().find((e) => e.name === 'UserService')!;
    const base = graph.entities().find((e) => e.name === 'BaseService')!;
    expect(rels.some((r) => r.source === userSvc.id && r.kind === 'extends' && r.target === base.id)).toBe(true);

    // Import: relative → dependsOn module; external → library.
    expect(graph.byKind('library').some((l) => l.name === 'zod')).toBe(true);
    expect(rels.some((r) => r.kind === 'dependsOn')).toBe(true);

    // Call graph: a() calls b().
    const a = graph.entities().find((e) => e.name === 'a' && e.kind === 'function')!;
    const b = graph.entities().find((e) => e.name === 'b' && e.kind === 'function')!;
    expect(rels.some((r) => r.source === a.id && r.kind === 'calls' && r.target === b.id)).toBe(true);

    // Containment: module contains the class.
    expect(rels.some((r) => r.kind === 'contains' && r.target === userSvc.id)).toBe(true);
  });

  it('derives architecture concepts (bounded contexts, layers)', () => {
    const graph = graphOf([
      { path: 'src/users/controllers/user.controller.ts', content: 'export class UserController {}' },
      { path: 'src/users/repositories/user.repository.ts', content: 'export class UserRepository {}' },
    ]);
    expect(graph.byKind('boundedContext').some((b) => b.name === 'src')).toBe(true);
    expect(graph.byKind('layer').map((l) => l.name)).toEqual(expect.arrayContaining(['presentation', 'domain']));
  });
});

describe('static analysis — infrastructure + database', () => {
  it('wires compose services and resolves SQL foreign keys', () => {
    const graph = graphOf([
      { path: 'docker-compose.yml', content: COMPOSE },
      { path: 'schema.sql', content: SQL_SCHEMA },
    ]);
    const api = graph.entities().find((e) => e.name === 'api')!;
    const db = graph.entities().find((e) => e.name === 'db')!;
    expect(graph.relations().some((r) => r.source === api.id && r.target === db.id)).toBe(true);

    const users = graph.entities().find((e) => e.name === 'users' && e.kind === 'table')!;
    const orgs = graph.entities().find((e) => e.name === 'organizations')!;
    expect(graph.relations().some((r) => r.source === users.id && r.kind === 'references' && r.target === orgs.id)).toBe(true);
  });
});
