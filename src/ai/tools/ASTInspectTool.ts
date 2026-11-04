import { z } from 'zod';
import type { Tool } from './Tool';
import type { ExecutionContext } from '../execution/ExecutionContext';
import type { ReverseEngineeringEngine } from '../reverse-engineering/ReverseEngineeringEngine';
import { nodesOfKind } from '../reverse-engineering/ast/NormalizedAST';

export const ASTInspectInputSchema = z.object({
  path: z.string().min(1),
  target: z.enum(['all', 'classes', 'functions', 'imports', 'exports']).default('all'),
});

export type ASTInspectInput = z.infer<typeof ASTInspectInputSchema>;

export class ASTInspectTool implements Tool {
  readonly id = 'ast:inspect';
  readonly name = 'AST Inspect Tool';
  readonly description = 'Inspects previously parsed source code ASTs, classes, imports, functions, and interfaces.';
  readonly permissionsRequired = ['read:ast'];
  readonly inputSchema = ASTInspectInputSchema;

  async execute(args: ASTInspectInput, context: ExecutionContext): Promise<any> {
    const reEngine: ReverseEngineeringEngine | undefined = context.metadata.reEngine;
    if (!reEngine) {
      return {
        success: false,
        error: 'No ReverseEngineeringEngine available in execution context',
      };
    }

    const ast = reEngine.getAST(args.path);
    if (!ast) {
      return {
        success: false,
        error: `No AST parsed for path "${args.path}". Verify that the file was imported and recognized by the parser registry.`,
      };
    }

    const target = args.target;
    const classNodes = nodesOfKind(ast, 'class');
    const methodNodes = nodesOfKind(ast, 'method');
    const functionNodes = nodesOfKind(ast, 'function');
    const interfaceNodes = nodesOfKind(ast, 'interface');

    return {
      success: true,
      path: ast.file,
      language: ast.language,
      module: ast.module,
      classes:
        target === 'all' || target === 'classes'
          ? classNodes.map((c) => ({
              id: c.id,
              name: c.name,
              qualifiedName: c.qualifiedName,
              isExported: (c.modifiers ?? []).includes('export'),
              extends: c.extends,
              implements: c.implements,
              methods: methodNodes
                .filter((m) => m.parentId === c.id || (c.childIds ?? []).includes(m.id))
                .map((m) => ({
                  name: m.name,
                  modifiers: m.modifiers ?? [],
                  params: m.params?.map((p) => p.name) ?? [],
                })),
            }))
          : undefined,
      functions:
        target === 'all' || target === 'functions'
          ? functionNodes.map((f) => ({
              id: f.id,
              name: f.name,
              isExported: (f.modifiers ?? []).includes('export'),
              isAsync: (f.modifiers ?? []).includes('async'),
              params: f.params?.map((p) => p.name) ?? [],
            }))
          : undefined,
      imports:
        target === 'all' || target === 'imports'
          ? ast.imports.map((i) => ({
              path: i.path,
              names: i.names,
              relative: i.relative,
              line: i.line,
            }))
          : undefined,
      exports:
        target === 'all' || target === 'exports'
          ? [...ast.exports]
          : undefined,
      interfaces:
        target === 'all'
          ? interfaceNodes.map((i) => ({
              name: i.name,
              extends: i.extends,
            }))
          : undefined,
    };
  }
}
