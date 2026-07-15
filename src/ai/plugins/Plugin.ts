import type { Capability } from '../capabilities/CapabilityDescriptor';
import type { Tool } from '../tools/Tool';
import type { ExecutionUnit } from '../execution/ExecutionUnit';

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly capabilities?: readonly Capability[];
  readonly tools?: readonly Tool[];
  readonly executionUnits?: readonly ExecutionUnit[];
}

export interface Plugin {
  readonly manifest: PluginManifest;
  initialize(framework: any): Promise<void>;
  cleanup(framework: any): Promise<void>;
}
