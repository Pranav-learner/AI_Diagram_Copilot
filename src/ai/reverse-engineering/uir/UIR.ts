import type { Language, NormalizedAST, SourceRef, ImportRef } from '../ast/NormalizedAST';

export interface UIRReference {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: Language;
}

export type UIRMetadata = Readonly<Record<string, any>>;

export interface UIREntity {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly qualifiedName?: string;
  readonly visibility?: 'public' | 'private' | 'protected' | 'package' | string;
  readonly ownership?: string;
  readonly reference?: UIRReference;
  readonly metadata: UIRMetadata;
  readonly annotations?: readonly string[];
  readonly doc?: string;
}

export interface UIRRelationship {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: string; // 'calls' | 'extends' | 'implements' | 'dependsOn' | 'contains' | 'imports' | etc.
  readonly metadata: UIRMetadata;
}

export interface UIRDocument {
  readonly file: string;
  readonly language: Language;
  readonly module: string;
  readonly entities: readonly UIREntity[];
  readonly relationships: readonly UIRRelationship[];
  readonly metadata: UIRMetadata;
  readonly warnings: readonly string[];
}

export class UIRBuilder {
  private readonly entities: UIREntity[] = [];
  private readonly relationships: UIRRelationship[] = [];
  private readonly warnings: string[] = [];
  private readonly metadata: Record<string, any> = {};

  constructor(
    private readonly file: string,
    private readonly language: Language,
    private readonly moduleName: string
  ) {}

  addEntity(entity: Omit<UIREntity, 'metadata'> & { metadata?: Record<string, any> }): string {
    const fullEntity: UIREntity = {
      ...entity,
      metadata: entity.metadata ?? {}
    };
    this.entities.push(fullEntity);
    return entity.id;
  }

  addRelationship(rel: Omit<UIRRelationship, 'id' | 'metadata'> & { id?: string; metadata?: Record<string, any> }): string {
    const id = rel.id ?? `${rel.sourceId}|${rel.kind}|${rel.targetId}`;
    const fullRel: UIRRelationship = {
      id,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      kind: rel.kind,
      metadata: rel.metadata ?? {}
    };
    this.relationships.push(fullRel);
    return id;
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  setMeta(key: string, value: any): void {
    this.metadata[key] = value;
  }

  build(): UIRDocument {
    return {
      file: this.file,
      language: this.language,
      module: this.moduleName,
      entities: this.entities,
      relationships: this.relationships,
      metadata: this.metadata,
      warnings: this.warnings
    };
  }
}

export class UIRSerializer {
  static serialize(doc: UIRDocument): string {
    return JSON.stringify(doc, null, 2);
  }

  static deserialize(json: string): UIRDocument {
    const parsed = JSON.parse(json);
    return {
      file: parsed.file ?? '',
      language: parsed.language ?? 'unknown',
      module: parsed.module ?? '',
      entities: parsed.entities ?? [],
      relationships: parsed.relationships ?? [],
      metadata: parsed.metadata ?? {},
      warnings: parsed.warnings ?? []
    };
  }
}

export class UIRValidator {
  static validate(doc: UIRDocument): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const entityIds = new Set<string>();

    if (!doc.file) {
      errors.push('UIRDocument is missing "file" path.');
    }

    for (const entity of doc.entities) {
      if (!entity.id) {
        errors.push(`Entity is missing ID: ${JSON.stringify(entity)}`);
      } else if (entityIds.has(entity.id)) {
        errors.push(`Duplicate entity ID: ${entity.id}`);
      } else {
        entityIds.add(entity.id);
      }
      if (!entity.name) {
        errors.push(`Entity ${entity.id} is missing "name".`);
      }
      if (!entity.kind) {
        errors.push(`Entity ${entity.id} is missing "kind".`);
      }
    }

    for (const rel of doc.relationships) {
      if (!rel.sourceId) {
        errors.push(`Relationship is missing "sourceId": ${rel.id}`);
      }
      if (!rel.targetId) {
        errors.push(`Relationship is missing "targetId": ${rel.id}`);
      }
      if (!rel.kind) {
        errors.push(`Relationship is missing "kind": ${rel.id}`);
      }
    }

    return { ok: errors.length === 0, errors };
  }
}

/** Translate a NormalizedAST (Language AST) into a UIRDocument (UIR). */
export function astToUIR(ast: NormalizedAST): UIRDocument {
  const b = new UIRBuilder(ast.file, ast.language, ast.module);

  for (const [k, v] of Object.entries(ast.metadata)) {
    b.setMeta(k, v);
  }
  b.setMeta('imports', ast.imports);
  b.setMeta('exports', ast.exports);

  for (const w of ast.warnings) {
    b.warn(w);
  }

  for (const node of ast.nodes.values()) {
    let visibility: string | undefined;
    if (node.modifiers) {
      if (node.modifiers.includes('public')) visibility = 'public';
      else if (node.modifiers.includes('private')) visibility = 'private';
      else if (node.modifiers.includes('protected')) visibility = 'protected';
      else if (node.modifiers.includes('package')) visibility = 'package';
      else if (node.modifiers.includes('export')) visibility = 'public';
    }

    const ownership = node.metadata?.owner as string | undefined;

    b.addEntity({
      id: node.id,
      kind: node.kind,
      name: node.name,
      qualifiedName: node.qualifiedName,
      visibility,
      ownership,
      reference: node.source,
      annotations: node.annotations,
      doc: node.doc,
      metadata: {
        ...node.metadata,
        extends: node.extends,
        implements: node.implements,
        references: node.references,
        calls: node.calls,
        returns: node.returns,
        params: node.params,
        modifiers: node.modifiers
      }
    });

    if (node.parentId) {
      b.addRelationship({
        sourceId: node.parentId,
        targetId: node.id,
        kind: 'contains'
      });
    }
  }

  return b.build();
}
