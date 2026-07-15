import type { Mission } from './Mission';

export interface ValidationResult {
  readonly success: boolean;
  readonly errors: readonly string[];
  readonly criteriaChecked: number;
}

export class MissionValidator {
  static validate(
    mission: Mission,
    nodeResults: ReadonlyMap<string, any>,
    projectOntology?: any
  ): ValidationResult {
    const errors: string[] = [];
    let criteriaChecked = 0;

    // 1. Validate Objectives
    for (const obj of mission.objectives) {
      if (obj.status !== 'completed') {
        errors.push(`Objective "${obj.name}" (${obj.id}) is not completed. Status: ${obj.status}`);
      }
    }

    // 2. Validate Success Criteria
    for (const crit of mission.successCriteria) {
      criteriaChecked++;
      if (!crit.checked) {
        errors.push(`Success criteria "${crit.description}" (${crit.id}) has not been evaluated`);
      } else if (crit.passed === false) {
        errors.push(`Success criteria "${crit.description}" (${crit.id}) failed verification: ${crit.notes || 'No details'}`);
      }
    }

    // 3. Validate Agent Outputs and Evidence Traceability
    for (const [nodeId, result] of nodeResults.entries()) {
      if (result) {
        if (result.success === false) {
          errors.push(`Execution unit "${nodeId}" failed: ${result.error?.message || 'Unknown error'}`);
        } else {
          // Verify structured output properties
          if (result.confidence === undefined || result.confidence < 0.0 || result.confidence > 1.0) {
            errors.push(`Execution unit "${nodeId}" output has invalid confidence: ${result.confidence}`);
          }
          if (!Array.isArray(result.evidence) || result.evidence.length === 0) {
            errors.push(`Execution unit "${nodeId}" output lacks required evidence traceability`);
          }
        }
      }
    }

    // 4. Validate Ontology Compliance
    if (projectOntology) {
      for (const [nodeId, result] of nodeResults.entries()) {
        const data = result?.data;
        if (data) {
          // Check components or entities list inside the data
          const entities = data.entities || data.components || [];
          if (Array.isArray(entities)) {
            for (const entity of entities) {
              if (entity.kind && projectOntology.entityKinds && !projectOntology.entityKinds.includes(entity.kind)) {
                errors.push(`Execution unit "${nodeId}" output entity "${entity.name || entity.id}" has invalid ontology kind "${entity.kind}"`);
              }
            }
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      criteriaChecked,
    };
  }
}
