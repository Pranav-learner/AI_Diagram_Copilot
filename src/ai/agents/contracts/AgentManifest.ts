import { z } from 'zod';

export interface CostMetadata {
  readonly inputTokenCostPerMillion: number;
  readonly outputTokenCostPerMillion: number;
}

export interface LatencyMetadata {
  readonly expectedP50Ms: number;
  readonly expectedP95Ms: number;
}

export interface AgentManifest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly type: 'agent';
  readonly capabilities: readonly string[];
  readonly requiredContext: readonly string[];
  readonly supportedTools: readonly string[];
  readonly permissions: readonly string[];
  readonly inputSchema: z.ZodType<any>;
  readonly outputSchema: z.ZodType<any>;
  readonly dependencies?: readonly string[];
  readonly costMetadata: CostMetadata;
  readonly latencyMetadata: LatencyMetadata;
  readonly supportedModels: readonly string[];
  readonly healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
}

export const CostMetadataSchema = z.object({
  inputTokenCostPerMillion: z.number().nonnegative(),
  outputTokenCostPerMillion: z.number().nonnegative(),
});

export const LatencyMetadataSchema = z.object({
  expectedP50Ms: z.number().positive(),
  expectedP95Ms: z.number().positive(),
});

export const AgentManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string(),
  type: z.literal('agent'),
  capabilities: z.array(z.string()),
  requiredContext: z.array(z.string()),
  supportedTools: z.array(z.string()),
  permissions: z.array(z.string()),
  inputSchema: z.any(),
  outputSchema: z.any(),
  dependencies: z.array(z.string()).optional(),
  costMetadata: CostMetadataSchema,
  latencyMetadata: LatencyMetadataSchema,
  supportedModels: z.array(z.string()),
  healthStatus: z.enum(['healthy', 'degraded', 'unhealthy']).optional(),
});
