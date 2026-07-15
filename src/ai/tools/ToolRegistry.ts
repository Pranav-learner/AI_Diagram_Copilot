import type { Tool } from './Tool';
import type { ExecutionContext } from '../execution/ExecutionContext';
import type { EventBus } from '../events/EventBus';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool with id "${tool.id}" is already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  list(): readonly Tool[] {
    return Array.from(this.tools.values());
  }

  deregister(id: string): void {
    this.tools.delete(id);
  }

  async executeTool(id: string, args: any, context: ExecutionContext, eventBus?: EventBus): Promise<any> {
    const tool = this.get(id);
    if (!tool) {
      throw new Error(`Tool "${id}" not found`);
    }

    // Permission check
    for (const perm of tool.permissionsRequired) {
      if (!context.hasPermission(perm)) {
        throw new Error(`Permission denied: Tool "${id}" requires "${perm}" permission`);
      }
    }

    // Input schema validation (supports Zod and custom validators)
    let validatedArgs = args;
    if (tool.inputSchema) {
      if (typeof tool.inputSchema.parse === 'function') {
        validatedArgs = tool.inputSchema.parse(args);
      } else if (typeof tool.inputSchema === 'function') {
        validatedArgs = tool.inputSchema(args);
      }
    }

    context.checkCancellation();

    const startTime = Date.now();
    try {
      const result = await tool.execute(validatedArgs, context);
      const durationMs = Date.now() - startTime;

      if (eventBus) {
        await eventBus.publish({
          type: 'tool:invoked',
          timestamp: new Date(),
          traceId: context.traceId,
          taskId: context.taskId,
          sessionId: context.sessionId,
          unitId: (context.metadata.activeUnitId as string) ?? 'system',
          toolId: id,
          args: validatedArgs,
          result,
          durationMs,
        });
      }

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;

      if (eventBus) {
        await eventBus.publish({
          type: 'tool:invoked',
          timestamp: new Date(),
          traceId: context.traceId,
          taskId: context.taskId,
          sessionId: context.sessionId,
          unitId: (context.metadata.activeUnitId as string) ?? 'system',
          toolId: id,
          args: validatedArgs,
          error: err,
          durationMs,
        });
      }

      throw err;
    }
  }
}
