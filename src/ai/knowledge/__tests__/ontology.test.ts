import { describe, it, expect } from 'vitest';
import { defaultOntology } from '../ontology/ProjectOntology';
import { OntologyMapper } from '../ontology/OntologyMapper';

describe('Project Ontology and Ontology Mapper', () => {
  it('validates default ontology concepts and categories', () => {
    expect(defaultOntology.validateConcept('Service')).toBe(true);
    expect(defaultOntology.validateConcept('RESTService')).toBe(true);
    expect(defaultOntology.validateConcept('Class')).toBe(true);
    expect(defaultOntology.validateConcept('Database')).toBe(true);

    const serviceConcept = defaultOntology.getConcept('Service')!;
    expect(serviceConcept.category).toBe('Software');

    const dbConcept = defaultOntology.getConcept('Database')!;
    expect(dbConcept.category).toBe('Database');
  });

  it('verifies hierarchy and subconcept traversal', () => {
    // RESTService -> Service -> SoftwareComponent
    expect(defaultOntology.isSubconceptOf('RESTService', 'Service')).toBe(true);
    expect(defaultOntology.isSubconceptOf('RESTService', 'SoftwareComponent')).toBe(true);
    expect(defaultOntology.isSubconceptOf('RESTService', 'RESTService')).toBe(true);

    // Database -> DatabaseComponent
    expect(defaultOntology.isSubconceptOf('Database', 'DatabaseComponent')).toBe(true);

    // Non-existent parent or unrelated branch
    expect(defaultOntology.isSubconceptOf('RESTService', 'DatabaseComponent')).toBe(false);
    expect(defaultOntology.isSubconceptOf('Class', 'InfrastructureComponent')).toBe(false);
  });

  it('verifies ancestor and descendant retrieval', () => {
    const ancestors = defaultOntology.getAncestors('BackgroundJob');
    expect(ancestors).toContain('Worker');
    expect(ancestors).toContain('Service');
    expect(ancestors).toContain('SoftwareComponent');

    const descendants = defaultOntology.getDescendants('Service');
    expect(descendants).toContain('RESTService');
    expect(descendants).toContain('Gateway');
    expect(descendants).toContain('Worker');
    expect(descendants).toContain('BackgroundJob');
  });

  it('verifies ontology mapping from parser kinds', () => {
    expect(OntologyMapper.mapKind('class')).toBe('Class');
    expect(OntologyMapper.mapKind('endpoint')).toBe('Endpoint');
    expect(OntologyMapper.mapKind('operation')).toBe('Endpoint');
    expect(OntologyMapper.mapKind('ingress')).toBe('Gateway');
    expect(OntologyMapper.mapKind('actor')).toBe('Actor');
    expect(OntologyMapper.mapKind('invalid-kind')).toBe('SoftwareComponent'); // Fallback
  });
});
