/**
 * A minimal, dependency-free YAML parser covering the subset used by Compose,
 * Kubernetes, and OpenAPI manifests: indentation-based maps and lists, scalars
 * (quoted/number/bool/null), inline flow (`[a, b]`, `{k: v}`), comments, and
 * multi-document streams (`---`).
 *
 * It is intentionally *not* a full YAML implementation (no anchors/tags/multiline
 * block scalars beyond folding); it recovers gracefully and is deterministic — the
 * point is to normalise infra manifests into a JS value the parsers can walk.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

interface Line {
  readonly indent: number;
  readonly content: string;
}

/** Parse a single YAML document. */
export function parseYaml(text: string): YamlValue {
  const docs = parseYamlDocuments(text);
  return docs[0] ?? null;
}

/** Parse a multi-document YAML stream into an array of documents. */
export function parseYamlDocuments(text: string): YamlValue[] {
  const rawDocs = splitDocuments(text);
  return rawDocs.map((doc) => parseDoc(cleanLines(doc))).filter((v) => v !== null || rawDocs.length === 1);
}

function splitDocuments(text: string): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (/^---\s*$/.test(line)) {
      parts.push(current.join('\n'));
      current = [];
    } else if (/^\.\.\.\s*$/.test(line)) {
      parts.push(current.join('\n'));
      current = [];
    } else current.push(line);
  }
  parts.push(current.join('\n'));
  return parts.map((p) => p).filter((p, i) => p.trim() !== '' || i === 0);
}

function cleanLines(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split('\n')) {
    const noComment = stripComment(raw);
    if (noComment.trim() === '') continue;
    const indent = noComment.length - noComment.trimStart().length;
    out.push({ indent, content: noComment.trim() });
  }
  return out;
}

/** Remove a trailing ` # comment` (outside quotes) and full-line comments. */
function stripComment(line: string): string {
  let inS = false;
  let inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
  }
  return line;
}

function parseDoc(lines: Line[]): YamlValue {
  if (lines.length === 0) return null;
  const [value] = parseNode(lines, 0, lines[0]!.indent);
  return value;
}

function parseNode(lines: Line[], pos: number, minIndent: number): [YamlValue, number] {
  if (pos >= lines.length || lines[pos]!.indent < minIndent) return [null, pos];
  // The block is grouped at the *actual* indent of its first line (≥ minIndent).
  const indent = lines[pos]!.indent;
  return lines[pos]!.content.startsWith('- ') || lines[pos]!.content === '-' ? parseList(lines, pos, indent) : parseMap(lines, pos, indent);
}

function parseList(lines: Line[], pos: number, indent: number): [YamlValue[], number] {
  const arr: YamlValue[] = [];
  while (pos < lines.length && lines[pos]!.indent === indent && (lines[pos]!.content === '-' || lines[pos]!.content.startsWith('- '))) {
    const item = lines[pos]!.content === '-' ? '' : lines[pos]!.content.slice(2);
    if (item === '') {
      const [value, next] = parseNode(lines, pos + 1, indent + 1);
      arr.push(value);
      pos = next;
    } else if (/^[^:\s][^:]*:(\s|$)/.test(item)) {
      // Item is a map whose first key is inline (`- key: value`).
      const itemIndent = indent + 2;
      const block: Line[] = [{ indent: itemIndent, content: item }];
      let k = pos + 1;
      while (k < lines.length && lines[k]!.indent > indent) {
        block.push(lines[k]!);
        k++;
      }
      const [value] = parseMap(block, 0, itemIndent);
      arr.push(value);
      pos = k;
    } else {
      arr.push(parseScalar(item));
      pos++;
    }
  }
  return [arr, pos];
}

function parseMap(lines: Line[], pos: number, indent: number): [{ [key: string]: YamlValue }, number] {
  const obj: { [key: string]: YamlValue } = {};
  while (pos < lines.length && lines[pos]!.indent === indent && !lines[pos]!.content.startsWith('- ') && lines[pos]!.content !== '-') {
    const m = /^("(?:[^"]|\\")*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/.exec(lines[pos]!.content);
    if (!m) {
      pos++;
      continue;
    }
    const key = unquote(m[1]!.trim());
    const rest = m[2]!.trim();
    if (rest === '' || rest === '|' || rest === '>') {
      const [value, next] = parseNode(lines, pos + 1, indent + 1);
      obj[key] = value;
      pos = next;
    } else {
      obj[key] = parseScalar(rest);
      pos++;
    }
  }
  return [obj, pos];
}

function parseScalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) return splitFlow(s.slice(1, -1)).map(parseScalar);
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj: { [key: string]: YamlValue } = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const kv = /^([^:]+):\s*(.*)$/.exec(part);
      if (kv) obj[unquote(kv[1]!.trim())] = parseScalar(kv[2]!);
    }
    return obj;
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return unquote(s);
  if (s === 'true' || s === 'false') return s === 'true';
  if (s === 'null' || s === '~' || s === '') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);
  return s;
}

/** Split a flow-collection body on top-level commas. */
function splitFlow(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inS = false;
  let inD = false;
  let cur = '';
  for (const c of body) {
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (!inS && !inD && (c === '[' || c === '{')) depth++;
    else if (!inS && !inD && (c === ']' || c === '}')) depth--;
    else if (!inS && !inD && c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

/** Read a nested value by key path (safe on non-objects / undefined). */
export function getPath(value: YamlValue | undefined, ...keys: string[]): YamlValue {
  let cur: YamlValue | undefined = value;
  for (const key of keys) {
    if (cur && typeof cur === 'object' && !Array.isArray(cur) && key in cur) cur = (cur as Record<string, YamlValue>)[key];
    else return null;
  }
  return cur ?? null;
}

export function asObject(value: YamlValue | undefined): Record<string, YamlValue> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, YamlValue>) : undefined;
}
export function asArray(value: YamlValue | undefined): YamlValue[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
export function asString(value: YamlValue | undefined): string | undefined {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
}
