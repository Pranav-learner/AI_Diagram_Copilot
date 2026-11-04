import { ToolRegistry } from './ToolRegistry';
import { KnowledgeQueryTool } from './KnowledgeQueryTool';
import { RepositorySearchTool } from './RepositorySearchTool';
import { ASTInspectTool } from './ASTInspectTool';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new KnowledgeQueryTool());
  registry.register(new RepositorySearchTool());
  registry.register(new ASTInspectTool());
  return registry;
}

