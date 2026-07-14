import { describe, it, expect } from 'vitest';
import { UIRBuilder, UIRValidator, UIRSerializer, astToUIR } from '../uir/UIR';
import type { NormalizedAST, AstNode } from '../ast/NormalizedAST';

describe('UIR Builder, Validator, Serializer', () => {
  it('builds, validates, and serializes a UIR document', () => {
    const builder = new UIRBuilder('src/user.ts', 'typescript', 'src/user');
    builder.setMeta('version', '1.0.0');
    builder.warn('Sample warning');

    const cId = builder.addEntity({
      id: 'src/user.ts#0',
      kind: 'class',
      name: 'UserService',
      qualifiedName: 'src/user.UserService',
      visibility: 'public',
      ownership: 'PlatformTeam',
      reference: { file: 'src/user.ts', startLine: 5, endLine: 25, language: 'typescript' }
    });

    const mId = builder.addEntity({
      id: 'src/user.ts#1',
      kind: 'method',
      name: 'getUser',
      qualifiedName: 'src/user.UserService.getUser',
      visibility: 'public',
      reference: { file: 'src/user.ts', startLine: 10, endLine: 15, language: 'typescript' }
    });

    builder.addRelationship({
      sourceId: cId,
      targetId: mId,
      kind: 'contains'
    });

    const doc = builder.build();

    // Verify properties
    expect(doc.file).toBe('src/user.ts');
    expect(doc.language).toBe('typescript');
    expect(doc.module).toBe('src/user');
    expect(doc.metadata.version).toBe('1.0.0');
    expect(doc.warnings).toContain('Sample warning');
    expect(doc.entities).toHaveLength(2);
    expect(doc.relationships).toHaveLength(1);

    // Verify validation
    const validationResult = UIRValidator.validate(doc);
    expect(validationResult.ok).toBe(true);
    expect(validationResult.errors).toHaveLength(0);

    // Verify serialization
    const serialized = UIRSerializer.serialize(doc);
    const deserialized = UIRSerializer.deserialize(serialized);
    expect(deserialized.file).toBe(doc.file);
    expect(deserialized.entities).toHaveLength(doc.entities.length);
    expect(deserialized.relationships).toHaveLength(doc.relationships.length);
  });

  it('catches validation errors', () => {
    const invalidDoc = {
      file: '',
      language: 'unknown',
      module: 'test',
      entities: [
        { id: '', kind: 'class', name: '', metadata: {} }
      ],
      relationships: [
        { id: '1', sourceId: '', targetId: 'src/user.ts#1', kind: '', metadata: {} }
      ],
      metadata: {},
      warnings: []
    } as any;

    const validationResult = UIRValidator.validate(invalidDoc);
    expect(validationResult.ok).toBe(false);
    expect(validationResult.errors.length).toBeGreaterThan(0);
  });

  it('translates a NormalizedAST to UIRDocument correctly', () => {
    const mockNode: AstNode = {
      id: 'src/math.ts#0',
      kind: 'function',
      name: 'add',
      qualifiedName: 'math.add',
      source: { file: 'src/math.ts', startLine: 1, endLine: 3, language: 'typescript' },
      modifiers: ['export', 'async'],
      metadata: { owner: 'MathTeam' }
    };

    const mockAST: NormalizedAST = {
      file: 'src/math.ts',
      language: 'typescript',
      module: 'math',
      nodes: new Map([['src/math.ts#0', mockNode]]),
      rootIds: ['src/math.ts#0'],
      imports: [],
      exports: ['add'],
      metadata: { author: 'Pranav' },
      warnings: ['legacy codebase warning']
    };

    const uirDoc = astToUIR(mockAST);

    expect(uirDoc.file).toBe('src/math.ts');
    expect(uirDoc.language).toBe('typescript');
    expect(uirDoc.module).toBe('math');
    expect(uirDoc.metadata.author).toBe('Pranav');
    expect(uirDoc.warnings).toContain('legacy codebase warning');

    expect(uirDoc.entities).toHaveLength(1);
    const uirEntity = uirDoc.entities[0]!;
    expect(uirEntity.id).toBe('src/math.ts#0');
    expect(uirEntity.kind).toBe('function');
    expect(uirEntity.name).toBe('add');
    expect(uirEntity.qualifiedName).toBe('math.add');
    expect(uirEntity.visibility).toBe('public');
    expect(uirEntity.ownership).toBe('MathTeam');
    expect(uirEntity.metadata.modifiers).toContain('export');
  });
});
