import type { ExecutionUnit } from './ExecutionUnit';

export class ExecutionRegistry {
  private readonly units = new Map<string, ExecutionUnit>();

  register(unit: ExecutionUnit): void {
    if (this.units.has(unit.id)) {
      throw new Error(`Execution unit with id "${unit.id}" is already registered`);
    }
    this.units.set(unit.id, unit);
  }

  get(id: string): ExecutionUnit | undefined {
    return this.units.get(id);
  }

  has(id: string): boolean {
    return this.units.has(id);
  }

  list(): readonly ExecutionUnit[] {
    return Array.from(this.units.values());
  }

  deregister(id: string): void {
    this.units.delete(id);
  }

  byType(type: string): readonly ExecutionUnit[] {
    return Array.from(this.units.values()).filter((u) => u.type === type);
  }
}
