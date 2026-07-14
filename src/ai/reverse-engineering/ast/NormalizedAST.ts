/**
 * The Normalized AST — one unified, language-independent code model.
 *
 * Every language parser (TypeScript, Python, Go, Java, SQL, Docker, Kubernetes,
 * Terraform, OpenAPI, GraphQL, …) normalises its source into *these* concepts, so
 * the rest of the engine — static analysis, the Code Knowledge Graph, PKM merge —
 * is **parser-agnostic**. No parser-specific API ever leaks past this boundary.
 * This is the compiler-front-end IR of the reverse-engineering pipeline.
 */

/** Supported languages/formats. Open (`string & {}`) so plugins add more. */
export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'java'
  | 'sql'
  | 'dockerfile'
  | 'docker-compose'
  | 'kubernetes'
  | 'terraform'
  | 'openapi'
  | 'graphql'
  | 'json-schema'
  | 'unknown'
  | (string & {});

/**
 * The kind of a normalized node — common concepts across languages plus
 * infrastructure/API/data concepts. Open-ended.
 */
export type NodeKind =
  // Structure
  | 'module'
  | 'package'
  | 'namespace'
  // Types
  | 'class'
  | 'interface'
  | 'enum'
  | 'struct'
  | 'type'
  // Callables / values
  | 'function'
  | 'method'
  | 'variable'
  | 'field'
  // Linking
  | 'import'
  | 'export'
  // API
  | 'endpoint'
  | 'operation'
  | 'schema'
  // Data
  | 'table'
  | 'column'
  | 'view'
  // Infrastructure
  | 'service'
  | 'container'
  | 'deployment'
  | 'resource'
  | 'queue'
  | 'cache'
  | 'database'
  | 'ingress'
  | 'volume'
  | 'secret'
  | (string & {});

/** A precise source location: file + line range + language. */
export interface SourceRef {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: Language;
}

export type AstMetaValue = string | number | boolean | readonly string[];

/** A parameter of a function/method/operation. */
export interface AstParam {
  readonly name: string;
  readonly type?: string;
}

/** A normalized code entity. */
export interface AstNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
  /** Fully-qualified name where known (e.g. `pkg.Class.method`). */
  readonly qualifiedName?: string;
  readonly source: SourceRef;
  readonly parentId?: string;
  readonly childIds?: readonly string[];
  /** `export`, `public`, `static`, `async`, `abstract`, `readonly`, … */
  readonly modifiers?: readonly string[];
  /** Decorator / annotation names (without args). */
  readonly annotations?: readonly string[];
  /** Superclass / embedded type names. */
  readonly extends?: readonly string[];
  /** Implemented interface names. */
  readonly implements?: readonly string[];
  /** Called symbol names (heuristic, function/method bodies). */
  readonly calls?: readonly string[];
  /** Referenced type names (params/returns/fields). */
  readonly references?: readonly string[];
  readonly returns?: string;
  readonly params?: readonly AstParam[];
  /** Leading doc comment, trimmed. */
  readonly doc?: string;
  readonly metadata?: Readonly<Record<string, AstMetaValue>>;
}

/** A normalized import statement. */
export interface ImportRef {
  /** The raw module specifier (e.g. `./auth`, `express`, `pkg/x`). */
  readonly path: string;
  /** Imported symbol names, when enumerated. */
  readonly names: readonly string[];
  /** True when the path is a relative/local import. */
  readonly relative: boolean;
  readonly line: number;
}

/** The normalized AST of a single source file. */
export interface NormalizedAST {
  readonly file: string;
  readonly language: Language;
  /** Derived module/package identity (used to build the module graph). */
  readonly module: string;
  readonly nodes: ReadonlyMap<string, AstNode>;
  /** Top-level node ids in source order. */
  readonly rootIds: readonly string[];
  readonly imports: readonly ImportRef[];
  /** Exported symbol names. */
  readonly exports: readonly string[];
  readonly metadata: Readonly<Record<string, AstMetaValue>>;
  /** Non-fatal parse warnings (unsupported constructs, recovered errors). */
  readonly warnings: readonly string[];
}

/** All nodes of a given kind in an AST. */
export function nodesOfKind(ast: NormalizedAST, kind: NodeKind): AstNode[] {
  return [...ast.nodes.values()].filter((n) => n.kind === kind);
}
