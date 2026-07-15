import type { Plugin } from './Plugin';

export class PluginManager {
  private readonly plugins = new Map<string, Plugin>();
  private readonly framework: any;

  constructor(framework: any) {
    this.framework = framework;
  }

  async register(plugin: Plugin): Promise<void> {
    const id = plugin.manifest.id;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }

    // Verify dependencies
    if (plugin.manifest.dependencies) {
      for (const [depId, versionBound] of Object.entries(plugin.manifest.dependencies)) {
        const dep = this.plugins.get(depId);
        if (!dep) {
          throw new Error(`Missing dependency: Plugin "${id}" requires "${depId}"`);
        }
        // Basic version matching check
        if (versionBound && dep.manifest.version !== versionBound && !versionBound.startsWith('^')) {
          throw new Error(
            `Version mismatch: Plugin "${id}" requires "${depId}" version "${versionBound}", but version "${dep.manifest.version}" is installed`
          );
        }
      }
    }

    // Register capabilities
    if (plugin.manifest.capabilities) {
      for (const cap of plugin.manifest.capabilities) {
        this.framework.capabilities.register(cap);
      }
    }

    // Register tools
    if (plugin.manifest.tools) {
      for (const tool of plugin.manifest.tools) {
        this.framework.tools.register(tool);
      }
    }

    // Register execution units
    if (plugin.manifest.executionUnits) {
      for (const unit of plugin.manifest.executionUnits) {
        this.framework.execution.register(unit);
      }
    }

    // Run initialization
    await plugin.initialize(this.framework);
    this.plugins.set(id, plugin);
  }

  async deregister(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      return;
    }

    // Check if other plugins depend on this one
    for (const other of this.plugins.values()) {
      if (other.manifest.dependencies && id in other.manifest.dependencies) {
        throw new Error(`Cannot deregister plugin "${id}": Plugin "${other.manifest.id}" depends on it`);
      }
    }

    // Run cleanup
    await plugin.cleanup(this.framework);

    // Deregister capabilities
    if (plugin.manifest.capabilities) {
      for (const cap of plugin.manifest.capabilities) {
        this.framework.capabilities.deregister(cap.descriptor.id);
      }
    }

    // Deregister tools
    if (plugin.manifest.tools) {
      for (const tool of plugin.manifest.tools) {
        this.framework.tools.deregister(tool.id);
      }
    }

    // Deregister execution units
    if (plugin.manifest.executionUnits) {
      for (const unit of plugin.manifest.executionUnits) {
        this.framework.execution.deregister(unit.id);
      }
    }

    this.plugins.delete(id);
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  list(): readonly Plugin[] {
    return Array.from(this.plugins.values());
  }
}
