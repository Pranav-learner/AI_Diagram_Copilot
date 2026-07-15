import type { Capability } from './CapabilityDescriptor';

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    const id = capability.descriptor.id;
    if (this.capabilities.has(id)) {
      throw new Error(`Capability "${id}" is already registered`);
    }
    this.capabilities.set(id, capability);
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  list(): readonly Capability[] {
    return Array.from(this.capabilities.values());
  }

  deregister(id: string): void {
    this.capabilities.delete(id);
  }

  discover(criteria: (cap: Capability) => boolean): readonly Capability[] {
    return Array.from(this.capabilities.values()).filter(criteria);
  }

  checkDependencies(id: string): { satisfied: boolean; missing: string[] } {
    const capability = this.get(id);
    if (!capability) {
      throw new Error(`Capability "${id}" not found`);
    }

    const missing: string[] = [];
    for (const dep of capability.descriptor.dependencies) {
      if (!this.has(dep)) {
        missing.push(dep);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }
}
