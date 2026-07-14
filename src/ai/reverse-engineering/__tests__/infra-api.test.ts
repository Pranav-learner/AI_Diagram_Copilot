import { describe, it, expect } from 'vitest';
import { defaultParserRegistry, detectLanguage } from '../parsers';
import { parseYaml, asObject } from '../parsers/yaml';
import { nodesOfKind } from '../ast/NormalizedAST';
import { COMPOSE, K8S, TERRAFORM, OPENAPI, GRAPHQL, DOCKERFILE } from './helpers';

const registry = defaultParserRegistry();
const parse = (path: string, content: string) => registry.parse({ path, content }).ast!;

describe('language detection', () => {
  it('detects infra + api formats by content', () => {
    expect(detectLanguage('docker-compose.yml', COMPOSE)).toBe('docker-compose');
    expect(detectLanguage('deploy.yaml', K8S)).toBe('kubernetes');
    expect(detectLanguage('api.yaml', OPENAPI)).toBe('openapi');
    expect(detectLanguage('main.tf', TERRAFORM)).toBe('terraform');
    expect(detectLanguage('Dockerfile', DOCKERFILE)).toBe('dockerfile');
    expect(detectLanguage('schema.graphql', GRAPHQL)).toBe('graphql');
  });
});

describe('YAML parser', () => {
  it('parses nested maps and lists of maps', () => {
    const value = asObject(parseYaml(COMPOSE))!;
    const services = asObject(value.services)!;
    expect(Object.keys(services)).toEqual(['web', 'api', 'db', 'cache']);
    expect(asObject(services.web)!.image).toBe('nginx:alpine');
  });
});

describe('Docker Compose parser', () => {
  it('classifies services and captures dependencies', () => {
    const ast = parse('docker-compose.yml', COMPOSE);
    const nodes = [...ast.nodes.values()];
    expect(nodes.find((n) => n.name === 'db')?.kind).toBe('database');
    expect(nodes.find((n) => n.name === 'cache')?.kind).toBe('cache');
    expect(nodes.find((n) => n.name === 'web')?.references).toContain('api');
    expect(nodes.find((n) => n.name === 'api')?.references).toEqual(expect.arrayContaining(['db', 'cache']));
  });
});

describe('Kubernetes parser', () => {
  it('normalizes deployments and services', () => {
    const ast = parse('deploy.yaml', K8S);
    const dep = nodesOfKind(ast, 'deployment').find((n) => n.name === 'web')!;
    expect(dep.metadata?.replicas).toBe(3);
    expect(dep.metadata?.images).toEqual(['myrepo/web:1.0']);
    expect(nodesOfKind(ast, 'service').some((n) => n.name === 'web')).toBe(true);
  });
});

describe('Terraform parser', () => {
  it('classifies cloud resources and captures references', () => {
    const ast = parse('main.tf', TERRAFORM);
    const nodes = [...ast.nodes.values()];
    expect(nodes.find((n) => n.name === 'aws_db_instance.main')?.kind).toBe('database');
    expect(nodes.find((n) => n.name === 'aws_elasticache_cluster.cache')?.kind).toBe('cache');
    expect(nodes.find((n) => n.name === 'aws_ecs_service.api')?.references).toContain('aws_db_instance.main');
  });
});

describe('OpenAPI parser', () => {
  it('extracts operations and schemas', () => {
    const ast = parse('api.yaml', OPENAPI);
    const eps = nodesOfKind(ast, 'endpoint');
    expect(eps.some((e) => e.metadata?.method === 'GET' && e.metadata?.path === '/pets')).toBe(true);
    expect(eps.some((e) => e.metadata?.method === 'POST' && e.metadata?.path === '/pets')).toBe(true);
    expect(eps.find((e) => e.metadata?.method === 'GET')?.references).toContain('Pet');
    expect(nodesOfKind(ast, 'schema').some((s) => s.name === 'Pet')).toBe(true);
  });
});

describe('GraphQL parser', () => {
  it('extracts types and operations', () => {
    const ast = parse('schema.graphql', GRAPHQL);
    expect(nodesOfKind(ast, 'schema').map((s) => s.name)).toEqual(expect.arrayContaining(['User', 'Post']));
    expect(nodesOfKind(ast, 'operation').some((o) => o.name === 'user' && o.metadata?.operationType === 'query')).toBe(true);
    expect(nodesOfKind(ast, 'schema').find((s) => s.name === 'User')?.references).toContain('Post');
  });
});

describe('Dockerfile parser', () => {
  it('captures base image and exposed ports', () => {
    const ast = parse('Dockerfile', DOCKERFILE);
    const c = nodesOfKind(ast, 'container')[0]!;
    expect(c.metadata?.baseImage).toBe('node:20-alpine');
    expect(c.metadata?.ports).toEqual(['3000']);
  });
});
