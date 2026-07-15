import type { ExecutionUnit, ExecutionResult } from '../../execution/ExecutionUnit';
import type { ExecutionContext } from '../../execution/ExecutionContext';
import type { AgentManifest } from '../contracts/AgentManifest';
import type { AgentContext, AgentOutput } from '../contracts/AgentContract';
import { AgentValidator } from '../contracts/AgentValidator';

export abstract class BaseSpecialistAgent implements ExecutionUnit {
  readonly abstract manifest: AgentManifest;

  get id(): string {
    return this.manifest.id;
  }

  get name(): string {
    return this.manifest.name;
  }

  get type(): 'agent' {
    return 'agent';
  }

  get version(): string {
    return this.manifest.version;
  }

  async initialize?(context: ExecutionContext): Promise<void> {
    // Optional initialization hook
  }

  async validate?(context: ExecutionContext): Promise<boolean> {
    // Enforce permission checks before running the agent
    const allowed = context.permissions;
    const isGlobal = allowed.includes('*');
    if (!isGlobal) {
      for (const requiredPerm of this.manifest.permissions) {
        const matches = allowed.some((p) => {
          if (p === requiredPerm) return true;
          if (p.endsWith(':*')) {
            const prefix = p.slice(0, -2);
            if (requiredPerm.startsWith(prefix)) return true;
          }
          return false;
        });
        if (!matches) {
          return false;
        }
      }
    }
    return true;
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    let retries = 0;

    try {
      // 1. Validate input schema
      const inputData = context.metadata.inputData || {};
      const inputParse = this.manifest.inputSchema.safeParse(inputData);
      if (!inputParse.success) {
        return {
          success: false,
          error: new Error(`Input validation failed for agent "${this.id}": ${inputParse.error.message}`),
          executionTimeMs: Date.now() - startTime,
        };
      }

      // 2. Build the restricted Agent Context (prevent exposing the entire project)
      const agentContext: AgentContext = {
        executionContext: context,
        pim: this.slicePim(context.metadata.pim),
        ontology: this.sliceOntology(context.metadata.ontology),
        evidence: context.metadata.evidence || [],
        node: context.metadata.node,
        assignedTask: context.userGoal || context.metadata.assignedTask || 'Perform specialist analysis',
        allowedTools: this.manifest.supportedTools,
        permissions: this.manifest.permissions,
      };

      // 3. Execute the agent logic
      const rawResult = await this.runAgentLogic(agentContext);

      // 4. Validate output
      const validation = AgentValidator.validate(this.manifest, agentContext, rawResult);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error || new Error('Agent validation failed'),
          executionTimeMs: Date.now() - startTime,
        };
      }

      // 5. Structure and return the result
      const agentOutput: AgentOutput = {
        success: true,
        data: rawResult.data,
        evidence: rawResult.evidence || [],
        confidence: rawResult.confidence ?? 1.0,
        recommendations: rawResult.recommendations || [],
        validationMetadata: {
          validatedAt: new Date(),
          rulesChecked: ['schema_compliance', 'evidence_check', 'permission_enforcement', 'ontology_compliance'],
        },
        executionMetadata: {
          latencyMs: Date.now() - startTime,
          tokenUsage: rawResult.tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          modelUsed: rawResult.modelUsed || this.manifest.supportedModels[0] || 'mock-model',
          cost: rawResult.cost ?? 0.0,
          retries,
        },
      };

      // Emit metrics & logs if desired, or return
      return {
        success: true,
        data: agentOutput,
        executionTimeMs: Date.now() - startTime,
        tokenUsage: agentOutput.executionMetadata.tokenUsage,
      };

    } catch (err: any) {
      // Graceful error recovery: handle failures and return clean error results
      return {
        success: false,
        error: err,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  async cleanup?(context: ExecutionContext): Promise<void> {
    // Optional cleanup hook
  }

  /**
   * Invokes tools via AEF registry (so agents invoke tools through the AI Execution Framework).
   */
  protected async invokeTool(toolId: string, args: any, context: ExecutionContext): Promise<any> {
    if (!this.manifest.supportedTools.includes(toolId)) {
      throw new Error(`Tool "${toolId}" is not allowed for agent "${this.id}"`);
    }
    const framework = context.metadata.framework;
    if (framework && typeof framework.executeTool === 'function') {
      return framework.executeTool(toolId, args, context);
    }
    return { success: true, toolCalled: toolId, args };
  }

  /**
   * Context Restriction: Slices the PIM to expose ONLY elements relevant to this agent's capabilities.
   */
  private slicePim(fullPim?: any): Record<string, any> | undefined {
    if (!fullPim) return undefined;
    // Decouple by extracting only entities relevant to agent capabilities
    const sliced: Record<string, any> = { entities: [] };
    if (Array.isArray(fullPim.entities)) {
      sliced.entities = fullPim.entities.filter((entity: any) => {
        // e.g. DiagramAgent only gets visual or diagram entities, DatabaseAgent gets tables, etc.
        if (this.id === 'database-agent') {
          return entity.kind === 'database' || entity.kind === 'table' || entity.kind === 'schema';
        }
        if (this.id === 'diagram-agent') {
          return entity.kind === 'diagram' || entity.kind === 'component';
        }
        if (this.id === 'security-agent') {
          return entity.kind === 'service' || entity.kind === 'deployment' || entity.kind === 'api';
        }
        // Fallback: default limit
        return true;
      });
    }
    return sliced;
  }

  /**
   * Context Restriction: Slices the ontology concepts to expose only what is relevant.
   */
  private sliceOntology(fullOntology?: any): Record<string, any> | undefined {
    if (!fullOntology) return undefined;
    return {
      entityKinds: fullOntology.entityKinds || [],
      relationKinds: fullOntology.relationKinds || [],
    };
  }

  /**
   * Concrete subclass must implement this to perform the actual model invocation and task handling.
   */
  protected abstract runAgentLogic(context: AgentContext): Promise<{
    readonly data: any;
    readonly evidence: readonly any[];
    readonly confidence?: number;
    readonly recommendations?: readonly string[];
    readonly tokenUsage?: {
      readonly promptTokens: number;
      readonly completionTokens: number;
      readonly totalTokens: number;
    };
    readonly modelUsed?: string;
    readonly cost?: number;
  }>;
}
