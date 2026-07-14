/**
 * DocumentParser — deterministic Markdown / plain-text → {@link StructuredDocument}.
 *
 * A dependency-free, line-based block tokenizer (no remark/marked): it extracts
 * headings, sections, paragraphs, lists (nested + task items), tables, fenced code,
 * blockquotes, GitHub callouts, images, links, thematic breaks, and YAML-ish
 * frontmatter. Pure and deterministic — the same input always yields the same
 * model — so parsing is cacheable and testable. Plain text degrades gracefully
 * (everything becomes paragraphs).
 */

import type {
  DocMetadata,
  DocNode,
  DocReference,
  DocumentFormat,
  DocumentType,
  InlineSpan,
  ListItemNode,
  ListNode,
  MetaValue,
  OutlineEntry,
  SectionNode,
  StructuredDocument,
} from './StructuredDocument';
import { fnv1a, normalizeWhitespace, slug, wordCount } from '../util';

export interface DocumentInput {
  /** Stable id; derived from the name when omitted. */
  readonly id?: string;
  readonly name: string;
  readonly content: string;
  readonly format?: DocumentFormat;
  /** Skip classification and force this type. */
  readonly declaredType?: DocumentType;
  /** Extra metadata merged over parsed frontmatter. */
  readonly metadata?: DocMetadata;
  /** Version to stamp (defaults to 1). The engine increments on re-ingest. */
  readonly version?: number;
}

// Mutable build shapes (frozen into the readonly model at the end).
type Mut<T> = { -readonly [K in keyof T]: T[K] };
type MutSection = Mut<SectionNode> & { childIds: string[] };
type MutList = Mut<ListNode> & { itemIds: string[] };
type MutListItem = Mut<ListItemNode> & { childIds: string[] };

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^(```+|~~~+)\s*([\w+-]*)\s*$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;
const THEMATIC_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const CALLOUT_RE = /^>\s*\[!(\w+)\]\s*(.*)$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;
const INLINE_RE = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g;

/** Parse an input document into the structured model (provisional docType). */
export function parseDocument(input: DocumentInput): StructuredDocument {
  const format: DocumentFormat = input.format ?? 'markdown';
  const id = input.id ?? `doc-${slug(input.name) || fnv1a(input.name)}`;
  const nodes = new Map<string, DocNode>();
  const references: DocReference[] = [];
  let counter = 0;
  const nextId = () => `${id}::n${counter++}`;

  // ── Frontmatter ────────────────────────────────────────────────────────────
  const { metadata: frontmatter, body, bodyLine } = extractFrontmatter(input.content);
  const lines = body.split('\n');

  const rootIds: string[] = [];
  const sectionStack: MutSection[] = [];
  const addNode = (node: DocNode) => {
    nodes.set(node.id, node);
    const parent = sectionStack[sectionStack.length - 1];
    if (parent) parent.childIds.push(node.id);
    else rootIds.push(node.id);
  };
  const collectRefs = (nodeId: string, spans: readonly InlineSpan[]) => {
    for (const span of spans) {
      if ((span.kind === 'link' || span.kind === 'image') && span.target) {
        references.push({
          id: `${id}::r${references.length}`,
          kind: span.kind === 'image' ? 'image' : span.target.startsWith('#') ? 'crossref' : 'link',
          target: span.target,
          text: span.text,
          nodeId,
          internal: isInternal(span.target),
        });
      }
    }
  };

  let i = 0;
  let prevParagraphId: string | undefined;
  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    const lineNo = bodyLine + i;

    if (line.trim() === '') {
      prevParagraphId = undefined;
      i++;
      continue;
    }

    // Setext heading (=== / ---) turning the previous paragraph into a heading.
    if (prevParagraphId && /^\s*(=+|-+)\s*$/.test(line) && !THEMATIC_RE.test(line)) {
      const para = nodes.get(prevParagraphId);
      if (para && para.type === 'paragraph') {
        const level = line.trim().startsWith('=') ? 1 : 2;
        nodes.delete(prevParagraphId);
        removeChildRef(sectionStack, rootIds, prevParagraphId);
        openSection(level, para.text, para.position.line ?? lineNo);
        prevParagraphId = undefined;
        i++;
        continue;
      }
    }

    // ATX heading.
    const heading = format === 'markdown' ? HEADING_RE.exec(line) : null;
    if (heading) {
      openSection(heading[1]!.length, normalizeWhitespace(stripInline(heading[2]!)), lineNo);
      prevParagraphId = undefined;
      i++;
      continue;
    }

    // Fenced code block.
    const fence = format === 'markdown' ? FENCE_RE.exec(line) : null;
    if (fence) {
      const marker = fence[1]!.slice(0, 3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimEnd().startsWith(marker)) codeLines.push(lines[i++]!);
      i++; // closing fence
      const node: DocNode = { id: nextId(), type: 'codeBlock', position: { index: counter, line: lineNo }, metadata: {}, code: codeLines.join('\n'), ...(fence[2] ? { language: fence[2] } : {}), ...(sectionStack.length ? { parentId: sectionStack[sectionStack.length - 1]!.id } : {}) };
      addNode(node);
      prevParagraphId = undefined;
      continue;
    }

    // Thematic break.
    if (format === 'markdown' && THEMATIC_RE.test(line)) {
      addNode({ id: nextId(), type: 'thematicBreak', position: { index: counter, line: lineNo }, metadata: {}, ...parentField() });
      prevParagraphId = undefined;
      i++;
      continue;
    }

    // Blockquote / callout.
    if (format === 'markdown' && line.startsWith('>')) {
      const quoteLines: string[] = [];
      const first = CALLOUT_RE.exec(line);
      while (i < lines.length && lines[i]!.trimStart().startsWith('>')) quoteLines.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      const text = normalizeWhitespace(stripInline(first ? quoteLines.slice(0).join(' ').replace(/\[!\w+\]/, '') : quoteLines.join(' ')));
      if (first) {
        addNode({ id: nextId(), type: 'callout', position: { index: counter, line: lineNo }, metadata: {}, kind: first[1]!.toLowerCase(), text, ...parentField() });
      } else {
        const { text: qt, spans } = parseInline(quoteLines.join(' '));
        const node: DocNode = { id: nextId(), type: 'quote', position: { index: counter, line: lineNo }, metadata: {}, text: normalizeWhitespace(qt), spans, ...parentField() };
        addNode(node);
        collectRefs(node.id, spans);
      }
      prevParagraphId = undefined;
      continue;
    }

    // Image-only line.
    const img = format === 'markdown' ? IMAGE_ONLY_RE.exec(line) : null;
    if (img) {
      addNode({ id: nextId(), type: 'image', position: { index: counter, line: lineNo }, metadata: {}, alt: img[1] ?? '', src: img[2] ?? '', ...(img[3] ? { title: img[3] } : {}), ...parentField() });
      references.push({ id: `${id}::r${references.length}`, kind: 'image', target: img[2] ?? '', text: img[1] ?? '', nodeId: `${id}::n${counter - 1}`, internal: isInternal(img[2] ?? '') });
      prevParagraphId = undefined;
      i++;
      continue;
    }

    // Table.
    if (format === 'markdown' && line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') rows.push(splitRow(lines[i++]!));
      addNode({ id: nextId(), type: 'table', position: { index: counter, line: lineNo }, metadata: { columns: headers.length }, headers, rows, ...parentField() });
      prevParagraphId = undefined;
      continue;
    }

    // List.
    if (LIST_ITEM_RE.test(line)) {
      i = parseList(lines, i, lineNo);
      prevParagraphId = undefined;
      continue;
    }

    // Paragraph (accumulate until blank / block boundary).
    const paraLines = [line];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j]!.trimEnd();
      if (next.trim() === '' || (format === 'markdown' && (HEADING_RE.test(next) || FENCE_RE.test(next) || LIST_ITEM_RE.test(next) || next.startsWith('>') || THEMATIC_RE.test(next)))) break;
      if (/^\s*(=+|-+)\s*$/.test(next) && !THEMATIC_RE.test(next)) break;
      paraLines.push(next);
      j++;
    }
    const { text, spans } = parseInline(paraLines.join(' '));
    const node: DocNode = { id: nextId(), type: 'paragraph', position: { index: counter, line: lineNo }, metadata: {}, text: normalizeWhitespace(text), spans, ...parentField() };
    addNode(node);
    collectRefs(node.id, spans);
    prevParagraphId = node.id;
    i = j;
  }

  // ── Assemble ────────────────────────────────────────────────────────────────
  const metadata: DocMetadata = { ...frontmatter, ...(input.metadata ?? {}) };
  const sectionIds = [...nodes.values()].filter((n) => n.type === 'section').map((n) => n.id);
  const title = deriveTitle(nodes, sectionIds, metadata, input.name);
  const outline: OutlineEntry[] = sectionIds.map((sid) => {
    const s = nodes.get(sid) as SectionNode;
    return { sectionId: sid, level: s.level, heading: s.heading, slug: s.slug };
  });
  const counts = computeCounts(nodes, references, body);
  const source = { name: input.name, format, length: input.content.length, contentHash: fnv1a(input.content) };

  return {
    id,
    title,
    docType: input.declaredType ?? format,
    source,
    metadata,
    version: input.version ?? 1,
    nodes,
    rootIds,
    sectionIds,
    references,
    outline,
    counts,
  };

  // ── Local helpers (close over build state) ──────────────────────────────────
  function parentField(): { parentId?: string } {
    const parent = sectionStack[sectionStack.length - 1];
    return parent ? { parentId: parent.id } : {};
  }

  function openSection(level: number, headingText: string, lineNo: number): void {
    while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1]!.level >= level) sectionStack.pop();
    const parent = sectionStack[sectionStack.length - 1];
    const path = sectionStack.map((s) => s.heading);
    const section: MutSection = {
      id: nextId(),
      type: 'section',
      position: { index: counter, line: lineNo },
      metadata: {},
      level,
      heading: headingText,
      slug: slug(headingText) || `section-${counter}`,
      path,
      childIds: [],
      ...(parent ? { parentId: parent.id } : {}),
    };
    nodes.set(section.id, section);
    if (parent) parent.childIds.push(section.id);
    else rootIds.push(section.id);
    sectionStack.push(section);
  }

  function parseList(src: string[], start: number, lineNo: number): number {
    const first = LIST_ITEM_RE.exec(src[start]!)!;
    const rootList: MutList = { id: nextId(), type: 'list', position: { index: counter, line: lineNo }, metadata: {}, ordered: /\d/.test(first[2]!), itemIds: [], ...parentField() };
    nodes.set(rootList.id, rootList);
    const parent = sectionStack[sectionStack.length - 1];
    if (parent) parent.childIds.push(rootList.id);
    else rootIds.push(rootList.id);

    const stack: Array<{ indent: number; list: MutList; lastItem?: MutListItem }> = [{ indent: first[1]!.length, list: rootList }];
    let k = start;
    while (k < src.length) {
      const raw = src[k]!;
      const m = LIST_ITEM_RE.exec(raw);
      if (m) {
        const indent = m[1]!.length;
        while (stack.length > 1 && indent < stack[stack.length - 1]!.indent) stack.pop();
        let top = stack[stack.length - 1]!;
        if (indent > top.indent && top.lastItem) {
          const nested: MutList = { id: nextId(), type: 'list', position: { index: counter, line: bodyLine + k }, metadata: {}, ordered: /\d/.test(m[2]!), itemIds: [], parentId: top.lastItem.id };
          nodes.set(nested.id, nested);
          top.lastItem.childIds.push(nested.id);
          stack.push({ indent, list: nested });
          top = stack[stack.length - 1]!;
        }
        const task = TASK_RE.exec(m[3]!);
        const rawText = task ? task[2]! : m[3]!;
        const { text, spans } = parseInline(rawText);
        const item: MutListItem = { id: nextId(), type: 'listItem', position: { index: counter, line: bodyLine + k }, metadata: {}, text: normalizeWhitespace(text), spans, childIds: [], parentId: top.list.id, ...(task ? { checked: task[1]!.toLowerCase() === 'x' } : {}) };
        nodes.set(item.id, item);
        top.list.itemIds.push(item.id);
        top.lastItem = item;
        collectRefs(item.id, spans);
        k++;
      } else if (raw.trim() === '') {
        const next = src[k + 1];
        if (next !== undefined && (LIST_ITEM_RE.test(next) || /^\s{2,}\S/.test(next))) k++;
        else break;
      } else if (/^\s{2,}\S/.test(raw)) {
        const top = stack[stack.length - 1]!;
        if (top.lastItem) top.lastItem.text = normalizeWhitespace(`${top.lastItem.text} ${raw.trim()}`);
        k++;
      } else break;
    }
    return k;
  }
}

// ── Inline parsing ─────────────────────────────────────────────────────────────

/** Parse inline markdown into plain text + spans. */
export function parseInline(input: string): { text: string; spans: InlineSpan[] } {
  const spans: InlineSpan[] = [];
  let plain = '';
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(input)) !== null) {
    plain += input.slice(last, m.index);
    if (m[1] !== undefined && m[2] !== undefined) {
      spans.push({ kind: 'image', text: m[1], target: m[2] });
      plain += m[1];
    } else if (m[3] !== undefined && m[4] !== undefined) {
      spans.push({ kind: 'link', text: m[3], target: m[4] });
      plain += m[3];
    } else if (m[5] !== undefined) {
      spans.push({ kind: 'code', text: m[5] });
      plain += m[5];
    } else if (m[6] !== undefined || m[7] !== undefined) {
      const t = (m[6] ?? m[7])!;
      spans.push({ kind: 'strong', text: t });
      plain += t;
    } else if (m[8] !== undefined || m[9] !== undefined) {
      const t = (m[8] ?? m[9])!;
      spans.push({ kind: 'emphasis', text: t });
      plain += t;
    }
    last = INLINE_RE.lastIndex;
  }
  plain += input.slice(last);
  return { text: plain, spans };
}

/** Strip inline formatting to plain text (headings). */
function stripInline(input: string): string {
  return parseInline(input).text;
}

// ── Frontmatter + small helpers ────────────────────────────────────────────────

function extractFrontmatter(content: string): { metadata: DocMetadata; body: string; bodyLine: number } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return { metadata: {}, body: content, bodyLine: 1 };
  const lines = content.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { metadata: {}, body: content, bodyLine: 1 };
  const metadata: Record<string, MetaValue> = {};
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]!);
    if (m) metadata[m[1]!] = coerceMeta(m[2]!.trim());
  }
  return { metadata, body: lines.slice(end + 1).join('\n'), bodyLine: end + 2 };
}

function coerceMeta(value: string): MetaValue {
  const unquoted = value.replace(/^["']|["']$/g, '');
  if (/^\[.*\]$/.test(unquoted)) return unquoted.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (unquoted === 'true' || unquoted === 'false') return unquoted === 'true';
  if (/^-?\d+(\.\d+)?$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|?/, '').replace(/\|?\s*$/, '').split('|').map((c) => normalizeWhitespace(stripInline(c)));
}

function isInternal(target: string): boolean {
  return target.startsWith('#') || (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target) && !target.startsWith('//') && !target.startsWith('mailto:'));
}

function removeChildRef(stack: MutSection[], rootIds: string[], nodeId: string): void {
  const parent = stack[stack.length - 1];
  const arr = parent ? parent.childIds : rootIds;
  const idx = arr.indexOf(nodeId);
  if (idx >= 0) arr.splice(idx, 1);
}

function deriveTitle(nodes: Map<string, DocNode>, sectionIds: readonly string[], metadata: DocMetadata, name: string): string {
  if (typeof metadata.title === 'string' && metadata.title.trim()) return metadata.title.trim();
  const firstH1 = sectionIds.map((id) => nodes.get(id) as SectionNode).find((s) => s.level === 1);
  if (firstH1) return firstH1.heading;
  const firstSection = sectionIds.length ? (nodes.get(sectionIds[0]!) as SectionNode) : undefined;
  if (firstSection) return firstSection.heading;
  return name.replace(/\.[a-z]+$/i, '');
}

function computeCounts(nodes: Map<string, DocNode>, references: readonly DocReference[], body: string): StructuredDocument['counts'] {
  let sections = 0;
  let paragraphs = 0;
  let lists = 0;
  let tables = 0;
  let codeBlocks = 0;
  for (const n of nodes.values()) {
    if (n.type === 'section') sections++;
    else if (n.type === 'paragraph') paragraphs++;
    else if (n.type === 'list') lists++;
    else if (n.type === 'table') tables++;
    else if (n.type === 'codeBlock') codeBlocks++;
  }
  return { sections, paragraphs, lists, tables, codeBlocks, references: references.length, words: wordCount(body) };
}
