/**
 * ASTBuilder — the fluent helper every parser uses to assemble a
 * {@link NormalizedAST} without touching the immutable shapes directly.
 *
 * It owns id generation (file-local, collision-free), the parent/child wiring, and
 * the imports/exports/warnings collections, so a parser only describes *what it
 * found*. Node objects hold a live child-array reference, so nesting is a push.
 */

import type { AstNode, ImportRef, Language, NodeKind, NormalizedAST, SourceRef, AstMetaValue } from './NormalizedAST';

type Mut<T> = { -readonly [K in keyof T]: T[K] };
type MutNode = Mut<AstNode> & { childIds: string[] };

export interface NodeSpec {
  readonly kind: NodeKind;
  readonly name: string;
  readonly startLine: number;
  readonly endLine?: number;
  readonly qualifiedName?: string;
  readonly modifiers?: readonly string[];
  readonly annotations?: readonly string[];
  readonly extends?: readonly string[];
  readonly implements?: readonly string[];
  readonly calls?: readonly string[];
  readonly references?: readonly string[];
  readonly returns?: string;
  readonly params?: AstNode['params'];
  readonly doc?: string;
  readonly metadata?: Readonly<Record<string, AstMetaValue>>;
}

export class ASTBuilder {
  private readonly nodes = new Map<string, MutNode>();
  private readonly rootIds: string[] = [];
  private readonly imports: ImportRef[] = [];
  private readonly exports: string[] = [];
  private readonly warnings: string[] = [];
  private readonly metadata: Record<string, AstMetaValue> = {};
  private counter = 0;

  constructor(
    private readonly file: string,
    private readonly language: Language,
    private readonly moduleName: string,
  ) {}

  /** Add a node (optionally as a child of `parentId`). Returns its id. */
  add(spec: NodeSpec, parentId?: string): string {
    const id = `${this.file}#${this.counter++}`;
    const source: SourceRef = { file: this.file, startLine: spec.startLine, endLine: spec.endLine ?? spec.startLine, language: this.language };
    const node: MutNode = {
      id,
      kind: spec.kind,
      name: spec.name,
      source,
      childIds: [],
      ...(spec.qualifiedName ? { qualifiedName: spec.qualifiedName } : {}),
      ...(parentId ? { parentId } : {}),
      ...(spec.modifiers ? { modifiers: spec.modifiers } : {}),
      ...(spec.annotations ? { annotations: spec.annotations } : {}),
      ...(spec.extends ? { extends: spec.extends } : {}),
      ...(spec.implements ? { implements: spec.implements } : {}),
      ...(spec.calls ? { calls: spec.calls } : {}),
      ...(spec.references ? { references: spec.references } : {}),
      ...(spec.returns ? { returns: spec.returns } : {}),
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.doc ? { doc: spec.doc } : {}),
      ...(spec.metadata ? { metadata: spec.metadata } : {}),
    };
    this.nodes.set(id, node);
    if (parentId) this.nodes.get(parentId)?.childIds.push(id);
    else this.rootIds.push(id);
    return id;
  }

  /** Backfill fields discovered after a node was opened (end line, calls, …). */
  update(id: string, patch: { endLine?: number; calls?: readonly string[]; references?: readonly string[]; extends?: readonly string[]; implements?: readonly string[]; metadata?: Readonly<Record<string, AstMetaValue>> }): void {
    const node = this.nodes.get(id);
    if (!node) return;
    if (patch.endLine !== undefined) node.source = { ...node.source, endLine: patch.endLine };
    if (patch.calls && patch.calls.length) node.calls = patch.calls;
    if (patch.references && patch.references.length) node.references = patch.references;
    if (patch.extends && patch.extends.length) node.extends = patch.extends;
    if (patch.implements && patch.implements.length) node.implements = patch.implements;
    if (patch.metadata) node.metadata = { ...node.metadata, ...patch.metadata };
  }

  addImport(imp: ImportRef): void {
    this.imports.push(imp);
  }
  addExport(name: string): void {
    if (name && !this.exports.includes(name)) this.exports.push(name);
  }
  warn(message: string): void {
    this.warnings.push(message);
  }
  setMeta(key: string, value: AstMetaValue): void {
    this.metadata[key] = value;
  }
  /** Look up a node id previously returned by {@link add}. */
  node(id: string): AstNode | undefined {
    return this.nodes.get(id);
  }

  build(): NormalizedAST {
    return {
      file: this.file,
      language: this.language,
      module: this.moduleName,
      nodes: this.nodes,
      rootIds: this.rootIds,
      imports: this.imports,
      exports: this.exports,
      metadata: this.metadata,
      warnings: this.warnings,
    };
  }
}
