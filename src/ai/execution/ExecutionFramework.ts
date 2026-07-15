import { ExecutionRegistry } from './ExecutionRegistry';
import { ExecutionManager } from './ExecutionManager';
import { InMemoryExecutionStateStore, type ExecutionStateStore } from './ExecutionState';
import { ToolRegistry } from '../tools/ToolRegistry';
import { CapabilityRegistry } from '../capabilities/CapabilityRegistry';
import { EventBus } from '../events/EventBus';
import { PluginManager } from '../plugins/PluginManager';
import type { ExecutionContext } from './ExecutionContext';
import type { ExecutionResult } from './ExecutionUnit';

export interface ExecutionFrameworkOptions {
  readonly stateStore?: ExecutionStateStore;
  readonly concurrencyLimit?: number;
}

export class ExecutionFramework {
  readonly execution = new ExecutionRegistry();
  readonly tools = new ToolRegistry();
  readonly capabilities = new CapabilityRegistry();
  readonly events = new EventBus();
  readonly plugins: PluginManager;
  readonly manager: ExecutionManager;
  readonly stateStore: ExecutionStateStore;

  constructor(options: ExecutionFrameworkOptions = {}) {
    this.stateStore = options.stateStore ?? new InMemoryExecutionStateStore();
    this.plugins = new PluginManager(this);
    this.manager = new ExecutionManager({
      stateStore: this.stateStore,
      eventBus: this.events,
      concurrencyLimit: options.concurrencyLimit,
    });
  }

  async run(
    unitId: string,
    context: ExecutionContext,
    retryOptions?: { maxRetries?: number; initialDelayMs?: number }
  ): Promise<ExecutionResult> {
    const unit = this.execution.get(unitId);
    if (!unit) {
      throw new Error(`Execution unit "${unitId}" not found`);
    }

    return this.manager.run(unit, context, retryOptions);
  }

  async executeTool(toolId: string, args: any, context: ExecutionContext): Promise<any> {
    return this.tools.executeTool(toolId, args, context, this.events);
  }
}
