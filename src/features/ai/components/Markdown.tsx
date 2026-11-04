/**
 * Clean markdown renderer for AI responses and explanations.
 * Renders headings, bold, italic, code spans, lists, blockquotes, and code blocks safely.
 */

import { Fragment, type ReactNode } from 'react';

interface MarkdownProps {
  readonly content: string;
  readonly className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return <div className={`space-y-2 text-xs leading-relaxed ${className || ''}`}>{renderContent(content)}</div>;
}

function renderContent(text: string): ReactNode[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const elements: ReactNode[] = [];
  let currentList: string[] = [];
  let key = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={key++} className="my-1.5 list-disc space-y-1 pl-4 text-foreground/90">
          {currentList.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      flushList();
      continue;
    }

    // Heading: #, ##, ###, ####
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      if (level <= 2) {
        elements.push(
          <h3 key={key++} className="mt-3.5 mb-1.5 text-sm font-bold text-foreground tracking-tight">
            {renderInline(text)}
          </h3>
        );
      } else if (level === 3) {
        elements.push(
          <h4 key={key++} className="mt-2.5 mb-1 text-xs font-bold text-primary tracking-wide uppercase">
            {renderInline(text)}
          </h4>
        );
      } else {
        elements.push(
          <h5 key={key++} className="mt-2 mb-1 text-xs font-semibold text-foreground">
            {renderInline(text)}
          </h5>
        );
      }
      continue;
    }

    // Blockquote: > text
    if (line.startsWith('>')) {
      flushList();
      const quoteText = line.replace(/^>\s*/, '');
      elements.push(
        <blockquote key={key++} className="border-l-2 border-primary/50 pl-3 py-0.5 my-1.5 italic text-muted-foreground bg-muted/20 rounded-r">
          {renderInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // Unordered list item: - or *
    if (/^[-*]\s+/.test(line)) {
      currentList.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Standard paragraph line
    flushList();
    elements.push(
      <p key={key++} className="my-1 text-foreground/90 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  flushList();
  return elements;
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
    if (match[2] !== undefined) tokens.push(<strong key={key++} className="font-semibold text-foreground">{match[2]}</strong>);
    else if (match[3] !== undefined) tokens.push(<em key={key++}>{match[3]}</em>);
    else if (match[4] !== undefined) tokens.push(<code key={key++} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-primary">{match[4]}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) tokens.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  return tokens;
}
