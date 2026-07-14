export interface OntologyConcept {
  readonly name: string;
  readonly category: string;
  readonly parent?: string;
  readonly aliases?: readonly string[];
  readonly synonyms?: readonly string[];
  readonly description?: string;
  readonly metadata?: Record<string, any>;
}

export class ProjectOntology {
  static readonly VERSION = '1.0.0';

  private readonly concepts = new Map<string, OntologyConcept>();
  private readonly childToParent = new Map<string, string>();
  private readonly parentToChildren = new Map<string, Set<string>>();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const defaultConcepts: OntologyConcept[] = [
      // Software Component Hierarchy
      { name: 'SoftwareComponent', category: 'Software', description: 'Any software entity' },
      { name: 'Module', category: 'Software', parent: 'SoftwareComponent', description: 'A file or module grouping code symbols' },
      { name: 'Package', category: 'Software', parent: 'SoftwareComponent', description: 'A packaged bundle of code modules' },
      { name: 'Namespace', category: 'Software', parent: 'SoftwareComponent', description: 'A logical namespace grouping definitions' },
      { name: 'Interface', category: 'Software', parent: 'SoftwareComponent', description: 'An interface definition' },
      { name: 'Class', category: 'Software', parent: 'SoftwareComponent', description: 'A class definition' },
      { name: 'Struct', category: 'Software', parent: 'SoftwareComponent', description: 'A struct definition' },
      { name: 'Type', category: 'Software', parent: 'SoftwareComponent', description: 'A type definition' },
      { name: 'Enum', category: 'Software', parent: 'SoftwareComponent', description: 'An enum definition' },
      { name: 'Function', category: 'Software', parent: 'SoftwareComponent', description: 'A top-level function' },
      { name: 'Method', category: 'Software', parent: 'SoftwareComponent', description: 'A method on a class or struct' },
      { name: 'Variable', category: 'Software', parent: 'SoftwareComponent', description: 'A variable or constant' },
      { name: 'Field', category: 'Software', parent: 'SoftwareComponent', description: 'A field/property on a class or struct' },

      // Service hierarchy
      { name: 'Service', category: 'Software', parent: 'SoftwareComponent', aliases: ['Microservice'], description: 'A deployable service' },
      { name: 'RESTService', category: 'Software', parent: 'Service', description: 'A service exposing REST APIs' },
      { name: 'Gateway', category: 'Software', parent: 'Service', aliases: ['ApiGateway'], description: 'An API Gateway' },
      { name: 'Worker', category: 'Software', parent: 'Service', description: 'A background processing service' },
      { name: 'BackgroundJob', category: 'Software', parent: 'Worker', description: 'A periodic or triggered background task' },

      // Infrastructure Hierarchy
      { name: 'InfrastructureComponent', category: 'Infrastructure', description: 'Deployable hardware/software infrastructure' },
      { name: 'Container', category: 'Infrastructure', parent: 'InfrastructureComponent', description: 'A container definition (e.g. Docker)' },
      { name: 'Deployment', category: 'Infrastructure', parent: 'InfrastructureComponent', description: 'A deployment manifest' },
      { name: 'Resource', category: 'Infrastructure', parent: 'InfrastructureComponent', description: 'A generic cloud/infra resource' },
      { name: 'Cache', category: 'Infrastructure', parent: 'InfrastructureComponent', aliases: ['InMemoryStore'], description: 'A cache component' },
      { name: 'Queue', category: 'Infrastructure', parent: 'InfrastructureComponent', aliases: ['MessageQueue'], description: 'A message queue' },
      { name: 'DatabaseInstance', category: 'Infrastructure', parent: 'InfrastructureComponent', description: 'A database hosting instance' },

      // Database Hierarchy
      { name: 'DatabaseComponent', category: 'Database', description: 'Database schema and storage structures' },
      { name: 'Database', category: 'Database', parent: 'DatabaseComponent', description: 'A database definition' },
      { name: 'Table', category: 'Database', parent: 'DatabaseComponent', description: 'A database table' },
      { name: 'Column', category: 'Database', parent: 'DatabaseComponent', description: 'A database column' },
      { name: 'View', category: 'Database', parent: 'DatabaseComponent', description: 'A database view' },

      // API Hierarchy
      { name: 'ApiComponent', category: 'API', description: 'API interfaces and specifications' },
      { name: 'API', category: 'API', parent: 'ApiComponent', description: 'An API specification or endpoint set' },
      { name: 'Endpoint', category: 'API', parent: 'ApiComponent', description: 'A single API endpoint' },
      { name: 'Schema', category: 'API', parent: 'ApiComponent', description: 'A data model schema definition' },

      // Messaging Hierarchy
      { name: 'MessagingComponent', category: 'Messaging', description: 'Messaging pub/sub systems' },
      { name: 'Topic', category: 'Messaging', parent: 'MessagingComponent', description: 'A message topic' },
      { name: 'Subscription', category: 'Messaging', parent: 'MessagingComponent', description: 'A message subscription' },

      // Business Hierarchy
      { name: 'BusinessConcept', category: 'Business', description: 'Domain and organizational business concepts' },
      { name: 'Domain', category: 'Business', parent: 'BusinessConcept', description: 'A business domain or context' },
      { name: 'Capability', category: 'Business', parent: 'BusinessConcept', description: 'A business capability' },
      { name: 'Actor', category: 'Business', parent: 'BusinessConcept', description: 'A user actor or external client role' },
      { name: 'Process', category: 'Business', parent: 'BusinessConcept', description: 'A business or system process flow' },
      { name: 'Workflow', category: 'Business', parent: 'BusinessConcept', description: 'A sequence of business steps' },

      // Documentation Hierarchy
      { name: 'DocumentationConcept', category: 'Documentation', description: 'Documentation and specifications' },
      { name: 'Document', category: 'Documentation', parent: 'DocumentationConcept', description: 'A document source' },

      // Requirements Hierarchy
      { name: 'RequirementConcept', category: 'Requirements', description: 'Requirements, features, and specs' },
      { name: 'Requirement', category: 'Requirements', parent: 'RequirementConcept', description: 'A system requirement' },
      { name: 'Responsibility', category: 'Requirements', parent: 'RequirementConcept', description: 'An owner responsibility' },
      { name: 'Goal', category: 'Requirements', parent: 'RequirementConcept', description: 'An overarching project goal' },
      { name: 'Risk', category: 'Requirements', parent: 'RequirementConcept', description: 'A security or runtime risk' },
      { name: 'Constraint', category: 'Requirements', parent: 'RequirementConcept', description: 'A architectural or technology constraint' },
      { name: 'Assumption', category: 'Requirements', parent: 'RequirementConcept', description: 'A system assumption' },

      // Architecture Hierarchy
      { name: 'ArchitectureConcept', category: 'Architecture', description: 'Architectural patterns and context boundaries' },
      { name: 'BoundedContext', category: 'Architecture', parent: 'ArchitectureConcept', description: 'A bounded context' },
      { name: 'Layer', category: 'Architecture', parent: 'ArchitectureConcept', description: 'An architectural layer' },
      { name: 'Decision', category: 'Architecture', parent: 'ArchitectureConcept', description: 'An Architecture Decision Record (ADR)' },

      // Deployment Hierarchy
      { name: 'DeploymentComponent', category: 'Deployment', description: 'Deployment tools and configurations' },

      // Security Hierarchy
      { name: 'SecurityConcept', category: 'Security', description: 'Security assets and policies' },
      { name: 'Secret', category: 'Security', parent: 'SecurityConcept', description: 'A secret credential' },

      // Testing Hierarchy
      { name: 'TestingConcept', category: 'Testing', description: 'Test suites and definitions' },

      // Monitoring Hierarchy
      { name: 'MonitoringConcept', category: 'Monitoring', description: 'Observability tools' },

      // Operations Hierarchy
      { name: 'OperationsConcept', category: 'Operations', description: 'Operational procedures' }
    ];

    for (const c of defaultConcepts) {
      this.registerConcept(c);
    }
  }

  registerConcept(c: OntologyConcept): void {
    const key = c.name.toLowerCase();
    this.concepts.set(key, c);

    if (c.aliases) {
      for (const a of c.aliases) {
        this.concepts.set(a.toLowerCase(), c);
      }
    }
    if (c.synonyms) {
      for (const s of c.synonyms) {
        this.concepts.set(s.toLowerCase(), c);
      }
    }

    if (c.parent) {
      const pKey = c.parent.toLowerCase();
      this.childToParent.set(key, c.parent);
      const kids = this.parentToChildren.get(pKey) ?? new Set<string>();
      kids.add(c.name);
      this.parentToChildren.set(pKey, kids);
    }
  }

  getConcept(name: string): OntologyConcept | undefined {
    return this.concepts.get(name.toLowerCase());
  }

  isSubconceptOf(child: string, parent: string): boolean {
    let curr: string | undefined = child;
    const target = parent.toLowerCase();
    while (curr) {
      if (curr.toLowerCase() === target) return true;
      curr = this.childToParent.get(curr.toLowerCase());
    }
    return false;
  }

  getAncestors(name: string): string[] {
    const ancestors: string[] = [];
    let curr = this.childToParent.get(name.toLowerCase());
    while (curr) {
      ancestors.push(curr);
      curr = this.childToParent.get(curr.toLowerCase());
    }
    return ancestors;
  }

  getChildren(name: string): string[] {
    const kids = this.parentToChildren.get(name.toLowerCase());
    return kids ? [...kids] : [];
  }

  getDescendants(name: string): string[] {
    const descendants: string[] = [];
    const queue = [name];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const kids = this.getChildren(curr);
      for (const k of kids) {
        descendants.push(k);
        queue.push(k);
      }
    }
    return descendants;
  }

  validateConcept(name: string): boolean {
    return this.concepts.has(name.toLowerCase());
  }
}

export const defaultOntology = new ProjectOntology();
