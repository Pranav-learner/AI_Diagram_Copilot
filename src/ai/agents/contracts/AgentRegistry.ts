import type { AgentManifest } from './AgentManifest';
import type { ExecutionUnit } from '../../execution/ExecutionUnit';

export class AgentRegistry {
  private readonly manifests = new Map<string, AgentManifest>();
  private readonly agents = new Map<string, ExecutionUnit>();

  register(manifest: AgentManifest, agent: ExecutionUnit): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Agent with ID "${manifest.id}" is already registered`);
    }
    this.manifests.set(manifest.id, manifest);
    this.agents.set(manifest.id, agent);
  }

  getManifest(id: string): AgentManifest | undefined {
    return this.manifests.get(id);
  }

  getAgent(id: string): ExecutionUnit | undefined {
    return this.agents.get(id);
  }

  listManifests(): readonly AgentManifest[] {
    return Array.from(this.manifests.values());
  }

  discover(options: {
    readonly capabilities?: readonly string[];
    readonly maxCost?: number;
    readonly maxLatency?: number;
    readonly version?: string;
    readonly health?: 'healthy' | 'degraded' | 'unhealthy';
    readonly permissions?: readonly string[];
  }): readonly AgentManifest[] {
    let list = Array.from(this.manifests.values());

    if (options.capabilities) {
      list = list.filter((m) =>
        options.capabilities!.every((c) => m.capabilities.includes(c))
      );
    }

    if (options.maxCost !== undefined) {
      list = list.filter(
        (m) =>
          m.costMetadata.inputTokenCostPerMillion + m.costMetadata.outputTokenCostPerMillion <=
          options.maxCost!
      );
    }

    if (options.maxLatency !== undefined) {
      list = list.filter((m) => m.latencyMetadata.expectedP50Ms <= options.maxLatency!);
    }

    if (options.version !== undefined) {
      list = list.filter((m) => m.version === options.version);
    }

    if (options.health !== undefined) {
      list = list.filter((m) => (m.healthStatus ?? 'healthy') === options.health);
    }

    if (options.permissions) {
      list = list.filter((m) =>
        m.permissions.every((p) =>
          options.permissions!.includes(p) || options.permissions!.includes('*')
        )
      );
    }

    return list;
  }
}
