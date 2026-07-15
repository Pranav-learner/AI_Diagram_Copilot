export interface CapabilityDescriptor {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly type: 'agent' | 'workflow' | 'tool' | 'service' | string;
  readonly permissions: readonly string[];
  readonly dependencies: readonly string[];
  readonly metadata?: Readonly<Record<string, any>>;
}

export interface Capability {
  readonly descriptor: CapabilityDescriptor;
  readonly unitId?: string;
  readonly toolIds?: readonly string[];
}
