/**
 * A tiny, dependency-free markdown renderer.
 *
 * Explain Mode returns markdown prose; the repo has no markdown library and we
 * don't want to add one for a handful of constructs. This supports the subset the
 * explanations use — headings (`##`), bold, italic, inline `code`, and unordered
 * lists — and renders to React elements (so text is escaped by React, never
 * injected as HTML). Anything unrecognised falls through as a paragraph.
 */

import { Fragment, type ReactNode } from 'react';

interface MarkdownProps {
  readonly content: string;
  readonly className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return <div className={className}>{renderBlocks(content)}</div>;
}

/** Split into blank-line-separated blocks and render each. */
function renderBlocks(text: string): ReactNode[] {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block, i) => renderBlock(block.trim(), i)).filter(Boolean);
}

function renderBlock(block: string, key: number): ReactNode {
  if (!block) return null;

  // Heading: ## Text
  const heading = /^(#{1,6})\s+(.*)$/.exec(block);
  if (heading) {
    return (
      <h4 key={key} className="mt-3 mb-1 text-sm font-semibold text-foreground">
        {renderInline(heading[2]!)}
      </h4>
    );
  }

  // Unordered list: every line starts with - or *
  const lines = block.split('\n');
  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return (
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-4">
        {lines.map((l, i) => (
          <li key={i}>{renderInline(l.replace(/^\s*[-*]\s+/, ''))}</li>
        ))}
      </ul>
    );
  }

  return (
    <p key={key} className="my-1 leading-relaxed">
      {renderInline(block)}
    </p>
  );
}

/** Parse inline **bold**, *italic*, and `code`. */
function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    if (match[2] !== undefined) tokens.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    else if (match[3] !== undefined) tokens.push(<em key={key++}>{match[3]}</em>);
    else if (match[4] !== undefined) tokens.push(<code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{match[4]}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) tokens.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  return tokens;
}
