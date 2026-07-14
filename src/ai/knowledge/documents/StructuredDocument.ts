/**
 * The Structured Document Model — the renderer-independent IR of a document.
 *
 * A document is compiled into a flat, id-keyed map of strongly-typed nodes plus a
 * hierarchy (sections contain blocks; lists contain items) and an ordered outline.
 * This is the document analogue of the Diagram DSL: pure data, no Markdown/HTML/PDF
 * rendering concerns leak in. Knowledge extraction and the PKM consume *this*, never
 * the raw text — so the pipeline stays decoupled from any input format.
 *
 * Every element carries a unique id, a position (order + source line), its place in
 * the hierarchy (`parentId`), and metadata — the contract the spec requires.
 */

/** The raw input format the parser understood. */
export type DocumentFormat = 'markdown' | 'text';

/**
 * The classified *kind* of document. Open (`string & {}`) so new document families
 * extend without an enum edit.
 */
export type DocumentType =
  | 'readme'
  | 'prd'
  | 'srs'
  | 'adr'
  | 'api-doc'
  | 'meeting-notes'
  | 'sop'
  | 'architecture'
  | 'design'
  | 'requirements'
  | 'wiki'
  | 'markdown'
  | 'text'
  | (string & {});

/** Structural node kinds in the model. */
export type DocNodeType =
  | 'section'
  | 'paragraph'
  | 'list'
  | 'listItem'
  | 'table'
  | 'codeBlock'
  | 'quote'
  | 'callout'
  | 'image'
  | 'thematicBreak';

/** Where an element sits in the source + sibling order. */
export interface DocPosition {
  /** Order among all nodes (stable, monotonic). */
  readonly index: number;
  /** 1-based source line where the element begins, if known. */
  readonly line?: number;
}

export type MetaValue = string | number | boolean | readonly string[];
export type DocMetadata = Readonly<Record<string, MetaValue>>;

/** An inline span inside text-bearing nodes (bold/italic/code/link/image). */
export interface InlineSpan {
  readonly kind: 'strong' | 'emphasis' | 'code' | 'link' | 'image';
  readonly text: string;
  /** URL/anchor for links and images. */
  readonly target?: string;
}

interface NodeBase<T extends DocNodeType> {
  readonly id: string;
  readonly type: T;
  readonly position: DocPosition;
  /** Enclosing node id (a section, or a list for its items). */
  readonly parentId?: string;
  readonly metadata: DocMetadata;
}

/** A heading and everything it contains. Sections form the hierarchy skeleton. */
export interface SectionNode extends NodeBase<'section'> {
  /** 1–6. Level 0 is reserved for the synthetic document root. */
  readonly level: number;
  /** Plain-text heading. */
  readonly heading: string;
  /** URL-safe slug of the heading (for anchors/cross-refs). */
  readonly slug: string;
  /** Breadcrumb of ancestor headings, e.g. `["Overview", "Goals"]`. */
  readonly path: readonly string[];
  /** Child node ids (nested sections + blocks), in order. */
  readonly childIds: readonly string[];
}

export interface ParagraphNode extends NodeBase<'paragraph'> {
  readonly text: string;
  readonly spans: readonly InlineSpan[];
}

export interface ListNode extends NodeBase<'list'> {
  readonly ordered: boolean;
  readonly itemIds: readonly string[];
}

export interface ListItemNode extends NodeBase<'listItem'> {
  readonly text: string;
  readonly spans: readonly InlineSpan[];
  /** `true`/`false` for GitHub task-list items; absent otherwise. */
  readonly checked?: boolean;
  /** Nested list ids. */
  readonly childIds: readonly string[];
}

export interface TableNode extends NodeBase<'table'> {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface CodeBlockNode extends NodeBase<'codeBlock'> {
  readonly language?: string;
  readonly code: string;
}

export interface QuoteNode extends NodeBase<'quote'> {
  readonly text: string;
  readonly spans: readonly InlineSpan[];
}

/** A GitHub-style callout `> [!NOTE] …`. */
export interface CalloutNode extends NodeBase<'callout'> {
  readonly kind: 'note' | 'tip' | 'important' | 'warning' | 'caution' | (string & {});
  readonly text: string;
}

/** Images are captured as metadata only (never fetched/rendered). */
export interface ImageNode extends NodeBase<'image'> {
  readonly alt: string;
  readonly src: string;
  readonly title?: string;
}

export type ThematicBreakNode = NodeBase<'thematicBreak'>;

export type DocNode =
  | SectionNode
  | ParagraphNode
  | ListNode
  | ListItemNode
  | TableNode
  | CodeBlockNode
  | QuoteNode
  | CalloutNode
  | ImageNode
  | ThematicBreakNode;

/** A reference (link, image, or in-document cross-reference). */
export interface DocReference {
  readonly id: string;
  readonly kind: 'link' | 'image' | 'crossref';
  /** URL, or `#slug` for a cross-reference. */
  readonly target: string;
  readonly text: string;
  /** The node the reference appears in. */
  readonly nodeId: string;
  /** True when `target` is an internal anchor / relative path. */
  readonly internal: boolean;
}

/** One entry of the heading outline (a tree flattened with depth). */
export interface OutlineEntry {
  readonly sectionId: string;
  readonly level: number;
  readonly heading: string;
  readonly slug: string;
}

/** Provenance of the raw input. */
export interface DocumentSource {
  readonly name: string;
  readonly format: DocumentFormat;
  /** Character length of the raw input. */
  readonly length: number;
  /** Deterministic content fingerprint (for cache keys + change detection). */
  readonly contentHash: string;
}

export interface StructuredDocument {
  readonly id: string;
  readonly title: string;
  readonly docType: DocumentType;
  readonly source: DocumentSource;
  readonly metadata: DocMetadata;
  /** Monotonic version, bumped on each re-parse of the same document id. */
  readonly version: number;
  readonly nodes: ReadonlyMap<string, DocNode>;
  /** Top-level node ids (level-1 sections and any pre-heading blocks), in order. */
  readonly rootIds: readonly string[];
  /** All section ids, in document order. */
  readonly sectionIds: readonly string[];
  readonly references: readonly DocReference[];
  readonly outline: readonly OutlineEntry[];
  readonly counts: {
    readonly sections: number;
    readonly paragraphs: number;
    readonly lists: number;
    readonly tables: number;
    readonly codeBlocks: number;
    readonly references: number;
    readonly words: number;
  };
}

/** Narrowing helpers (avoid `as` at call sites). */
export function isSection(node: DocNode): node is SectionNode {
  return node.type === 'section';
}
export function isTextNode(node: DocNode): node is ParagraphNode | ListItemNode | QuoteNode | CalloutNode {
  return node.type === 'paragraph' || node.type === 'listItem' || node.type === 'quote' || node.type === 'callout';
}

/** The section a node belongs to (walk up `parentId` to the nearest section). */
export function sectionOf(doc: StructuredDocument, nodeId: string): SectionNode | undefined {
  let current = doc.nodes.get(nodeId);
  while (current) {
    if (isSection(current)) return current;
    current = current.parentId ? doc.nodes.get(current.parentId) : undefined;
  }
  return undefined;
}

/** Plain text of a node, for extraction/summaries (empty for structural-only nodes). */
export function nodeText(node: DocNode): string {
  switch (node.type) {
    case 'section':
      return node.heading;
    case 'paragraph':
    case 'listItem':
    case 'quote':
    case 'callout':
      return node.text;
    case 'codeBlock':
      return node.code;
    case 'table':
      return [node.headers.join(' '), ...node.rows.map((r) => r.join(' '))].join('\n');
    case 'image':
      return node.alt;
    default:
      return '';
  }
}
