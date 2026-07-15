import type { AgentManifest } from './AgentManifest';
import type { AgentContext } from './AgentContract';
import type { AgentOutput } from './AgentContract';

export class AgentValidator {
  /**
   * Validates the raw JSON output from a model/agent execution against the Agent Contract.
   */
  static validate(
    manifest: AgentManifest,
    context: AgentContext,
    output: any
  ): { readonly success: boolean; readonly error?: Error } {
    if (!output || typeof output !== 'object') {
      return { success: false, error: new Error('Agent output must be an object') };
    }

    // 1. Validate Schema
    if (output.data === undefined) {
      return { success: false, error: new Error('Agent output data field is missing') };
    }
    const schemaResult = manifest.outputSchema.safeParse(output.data);
    if (!schemaResult.success) {
      return {
        success: false,
        error: new Error(`Output schema validation failed: ${schemaResult.error.message}`),
      };
    }

    // 2. Validate Evidence
    if (!output.evidence || !Array.isArray(output.evidence)) {
      return { success: false, error: new Error('Agent output evidence is missing or invalid') };
    }
    if (output.evidence.length === 0) {
      return { success: false, error: new Error('Agent output must contain at least one piece of evidence') };
    }

    // 3. Validate Confidence
    if (
      typeof output.confidence !== 'number' ||
      output.confidence < 0 ||
      output.confidence > 1
    ) {
      return {
        success: false,
        error: new Error(`Confidence score "${output.confidence}" must be a number between 0 and 1`),
      };
    }

    // 4. Validate Permissions
    // Ensure that if the agent's manifest requests permissions, the context's permissions cover them.
    const allowed = context.permissions;
    const isGlobal = allowed.includes('*');
    if (!isGlobal) {
      for (const requiredPerm of manifest.permissions) {
        const matches = allowed.some((p) => {
          if (p === requiredPerm) return true;
          if (p.endsWith(':*')) {
            const prefix = p.slice(0, -2);
            if (requiredPerm.startsWith(prefix)) return true;
          }
          return false;
        });
        if (!matches) {
          return {
            success: false,
            error: new Error(`Context lacks required permission "${requiredPerm}" for agent "${manifest.id}"`),
          };
        }
      }
    }

    // 5. Validate Ontology Compliance
    // Ensure outputs refer to entities matching the ontology kind
    if (context.ontology) {
      const allowedEntityKinds = context.ontology.entityKinds || [];
      if (allowedEntityKinds.length > 0 && output.data.entityKind) {
        if (!allowedEntityKinds.includes(output.data.entityKind)) {
          return {
            success: false,
            error: new Error(
              `Ontology compliance failure: entity kind "${output.data.entityKind}" is not permitted`
            ),
          };
        }
      }
    }

    return { success: true };
  }
}
