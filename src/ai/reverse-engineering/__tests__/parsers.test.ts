import { describe, it, expect } from 'vitest';
import { defaultParserRegistry } from '../parsers';
import { nodesOfKind } from '../ast/NormalizedAST';
import { TS_SERVICE, TS_EXPRESS, PY_SERVICE, GO_SERVICE, JAVA_SERVICE, SQL_SCHEMA } from './helpers';

const registry = defaultParserRegistry();
const parse = (path: string, content: string) => {
  const r = registry.parse({ path, content });
  expect(r.ok).toBe(true);
  return r.ast!;
};

describe('TypeScript parser', () => {
  it('extracts imports, classes, inheritance, methods, and routes', () => {
    const ast = parse('src/user.service.ts', TS_SERVICE);
    expect(ast.language).toBe('typescript');
    expect(ast.imports.some((i) => i.path === '@nestjs/common' && !i.relative)).toBe(true);
    expect(ast.imports.some((i) => i.path === './user.repository' && i.relative)).toBe(true);

    const cls = nodesOfKind(ast, 'class').find((c) => c.name === 'UserService')!;
    expect(cls.extends).toEqual(['BaseService']);
    expect(cls.implements).toEqual(['IUserService']);
    expect(nodesOfKind(ast, 'method').some((m) => m.name === 'getUser')).toBe(true);
    expect(nodesOfKind(ast, 'function').some((f) => f.name === 'helper')).toBe(true);

    const endpoint = nodesOfKind(ast, 'endpoint').find((e) => e.metadata?.method === 'GET');
    expect(endpoint).toBeTruthy();
    expect(ast.exports).toContain('UserService');
  });

  it('extracts Express-style routes', () => {
    const ast = parse('src/app.ts', TS_EXPRESS);
    const eps = nodesOfKind(ast, 'endpoint');
    expect(eps.some((e) => e.metadata?.method === 'GET' && e.metadata?.path === '/health')).toBe(true);
    expect(eps.some((e) => e.metadata?.method === 'POST' && e.metadata?.path === '/users')).toBe(true);
  });
});

describe('Python parser', () => {
  it('extracts imports, classes, methods, functions, and routes', () => {
    const ast = parse('app/user.py', PY_SERVICE);
    expect(ast.language).toBe('python');
    expect(ast.imports.some((i) => i.path === 'fastapi')).toBe(true);
    expect(ast.imports.some((i) => i.path === '.models' && i.relative)).toBe(true);
    expect(nodesOfKind(ast, 'class').find((c) => c.name === 'UserService')?.extends).toEqual(['BaseService']);
    expect(nodesOfKind(ast, 'method').some((m) => m.name === 'get_user')).toBe(true);
    expect(nodesOfKind(ast, 'function').some((f) => f.name === 'read_user')).toBe(true);
    expect(nodesOfKind(ast, 'endpoint').some((e) => e.metadata?.path === '/users/{id}')).toBe(true);
  });
});

describe('Go parser', () => {
  it('extracts package, imports, structs, methods, and functions', () => {
    const ast = parse('user/service.go', GO_SERVICE);
    expect(ast.module).toBe('user');
    expect(ast.imports.map((i) => i.path)).toEqual(expect.arrayContaining(['context', 'example.com/db']));
    expect(nodesOfKind(ast, 'struct').map((s) => s.name)).toEqual(expect.arrayContaining(['User', 'Service']));
    const method = nodesOfKind(ast, 'method').find((m) => m.name === 'GetUser');
    expect(method?.metadata?.receiver).toBe('Service');
    expect(nodesOfKind(ast, 'function').some((f) => f.name === 'NewService')).toBe(true);
  });
});

describe('Java parser', () => {
  it('extracts package, classes, inheritance, methods, and Spring routes', () => {
    const ast = parse('src/UserService.java', JAVA_SERVICE);
    const cls = nodesOfKind(ast, 'class').find((c) => c.name === 'UserService')!;
    expect(cls.extends).toEqual(['BaseService']);
    expect(cls.implements).toEqual(['IUserService']);
    expect(nodesOfKind(ast, 'method').some((m) => m.name === 'getUser')).toBe(true);
    expect(nodesOfKind(ast, 'endpoint').some((e) => e.metadata?.method === 'GET' && e.metadata?.path === '/users')).toBe(true);
  });
});

describe('SQL parser', () => {
  it('extracts tables, columns, foreign keys, and views', () => {
    const ast = parse('schema.sql', SQL_SCHEMA);
    const users = nodesOfKind(ast, 'table').find((t) => t.name === 'users')!;
    expect(users.references).toContain('organizations');
    expect(nodesOfKind(ast, 'column').some((c) => c.name === 'name' && c.metadata?.nullable === false)).toBe(true);
    expect(nodesOfKind(ast, 'column').some((c) => c.name === 'id' && c.metadata?.primaryKey === true)).toBe(true);
    expect(nodesOfKind(ast, 'view').some((v) => v.name === 'active_users')).toBe(true);
  });
});
