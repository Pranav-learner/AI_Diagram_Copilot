import { z } from 'zod';

export type MissionType =
  | 'repository_analysis'
  | 'architecture_review'
  | 'documentation_generation'
  | 'diagram_generation'
  | 'security_audit'
  | 'performance_audit'
  | 'dependency_analysis'
  | 'onboarding_report'
  | 'technology_assessment'
  | 'migration_planning'
  | 'custom';

export type MissionPriority = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ExecutionStrategy = 'sequential' | 'parallel' | 'adaptive';

export type MissionStatus =
  | 'created'
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Objective {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  dependsOn?: readonly string[];
  unitId?: string; // Target agent or tool
}

export interface SuccessCriteria {
  readonly id: string;
  readonly description: string;
  checked: boolean;
  passed?: boolean;
  notes?: string;
}

export interface MissionConstraints {
  readonly maxCost?: number;
  readonly maxLatencyMs?: number;
  readonly allowedTools?: readonly string[];
  readonly requiredPermissions?: readonly string[];
}

export interface Mission {
  readonly id: string;
  readonly type: MissionType;
  readonly goal: string;
  readonly priority: MissionPriority;
  readonly riskLevel: RiskLevel;
  readonly strategy: ExecutionStrategy;
  readonly constraints: MissionConstraints;
  readonly successCriteria: readonly SuccessCriteria[];
  readonly requiredOutputs: readonly string[];
  
  // Real-time tracking fields
  status: MissionStatus;
  progress: number; // 0.0 to 1.0
  objectives: readonly Objective[];
  artifacts: string[]; // List of paths to generated files/diagrams/docs
  
  readonly metadata?: Readonly<Record<string, any>>;
}

// Zod schemas for validation
export const ObjectiveSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  dependsOn: z.array(z.string()).optional(),
  unitId: z.string().optional(),
});

export const SuccessCriteriaSchema = z.object({
  id: z.string(),
  description: z.string(),
  checked: z.boolean(),
  passed: z.boolean().optional(),
  notes: z.string().optional(),
});

export const MissionConstraintsSchema = z.object({
  maxCost: z.number().optional(),
  maxLatencyMs: z.number().optional(),
  allowedTools: z.array(z.string()).optional(),
  requiredPermissions: z.array(z.string()).optional(),
});

export const MissionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'repository_analysis',
    'architecture_review',
    'documentation_generation',
    'diagram_generation',
    'security_audit',
    'performance_audit',
    'dependency_analysis',
    'onboarding_report',
    'technology_assessment',
    'migration_planning',
    'custom',
  ]),
  goal: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  riskLevel: z.enum(['low', 'medium', 'high']),
  strategy: z.enum(['sequential', 'parallel', 'adaptive']),
  constraints: MissionConstraintsSchema,
  successCriteria: z.array(SuccessCriteriaSchema),
  requiredOutputs: z.array(z.string()),
  status: z.enum(['created', 'planning', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0.0).max(1.0),
  objectives: z.array(ObjectiveSchema),
  artifacts: z.array(z.string()),
  metadata: z.record(z.any()).optional(),
});
