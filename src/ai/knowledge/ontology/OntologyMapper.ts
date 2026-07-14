import { defaultOntology } from './ProjectOntology';

export class OntologyMapper {
  private static readonly KIND_TO_ONTOLOGY: Readonly<Record<string, string>> = {
    // Code symbols
    class: 'Class',
    interface: 'Interface',
    struct: 'Struct',
    enum: 'Enum',
    type: 'Type',
    function: 'Function',
    method: 'Method',
    variable: 'Variable',
    field: 'Field',
    module: 'Module',
    package: 'Package',
    namespace: 'Namespace',

    // API
    api: 'API',
    endpoint: 'Endpoint',
    operation: 'Endpoint',
    schema: 'Schema',

    // Database
    database: 'Database',
    table: 'Table',
    column: 'Column',
    view: 'View',

    // Infrastructure
    service: 'Service',
    container: 'Container',
    deployment: 'Deployment',
    resource: 'Resource',
    queue: 'Queue',
    cache: 'Cache',
    secret: 'Secret',
    ingress: 'Gateway',

    // Documentation extractors kinds
    actor: 'Actor',
    process: 'Process',
    workflow: 'Workflow',
    requirement: 'Requirement',
    responsibility: 'Responsibility',
    decision: 'Decision',
    goal: 'Goal',
    risk: 'Risk',
    constraint: 'Constraint',
    assumption: 'Assumption',
    concept: 'SoftwareComponent',
    system: 'SoftwareComponent',
    component: 'SoftwareComponent',
    library: 'Package',
    boundedContext: 'BoundedContext',
    layer: 'Layer',
  };

  /** Map a UIR or parser entity kind to a canonical Ontology concept name. */
  static mapKind(kind: string): string {
    const mapped = this.KIND_TO_ONTOLOGY[kind.toLowerCase()] || this.KIND_TO_ONTOLOGY[kind] || 'SoftwareComponent';
    if (defaultOntology.validateConcept(mapped)) {
      return mapped;
    }
    return 'SoftwareComponent';
  }

  /** Check if a mapped ontology type inherits from a parent concept. */
  static isTypeOf(ontologyType: string, parentType: string): boolean {
    return defaultOntology.isSubconceptOf(ontologyType, parentType);
  }
}
export default OntologyMapper;
