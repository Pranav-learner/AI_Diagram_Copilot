/**
 * Formatter — the last pipeline stage.
 *
 * It fuses the validated model prose ({@link Explanation}) with the graph-derived
 * {@link RelatedElement}s and suggested questions into one UI-ready
 * {@link FormattedExplanation}, and renders a single markdown document from the
 * structured parts. Keeping formatting separate from generation means the UI (or a
 * future exporter) can re-render without another model call.
 */

import type { Explanation } from './model/Explanation';
import type { ExplanationRequest, FormattedExplanation, RelatedElement } from './model/ExplainTypes';

export interface FormatInput {
  readonly request: ExplanationRequest;
  readonly explanation: Explanation;
  readonly relatedElements: readonly RelatedElement[];
  readonly suggestedQuestions: readonly string[];
}

/** Combine model prose + graph-derived context into the final explanation. */
export function formatExplanation(input: FormatInput): FormattedExplanation {
  const { request, explanation } = input;
  const keyPoints = explanation.keyPoints ?? [];
  const sections = explanation.sections ?? [];

  return {
    targetLabel: request.targetLabel,
    targetDescriptor: request.targetDescriptor,
    domain: request.domain,
    audience: request.audience,
    style: request.style,
    depth: request.depth,
    summary: explanation.summary,
    keyPoints,
    sections,
    markdown: renderMarkdown(explanation.summary, keyPoints, sections),
    relatedElements: input.relatedElements,
    suggestedQuestions: input.suggestedQuestions,
  };
}

/** Render the explanation as a single markdown document (prose only). */
function renderMarkdown(
  summary: string,
  keyPoints: readonly string[],
  sections: readonly { heading: string; body: string }[],
): string {
  const parts: string[] = [summary.trim()];
  if (keyPoints.length > 0) {
    parts.push(['**Key points**', ...keyPoints.map((p) => `- ${p.trim()}`)].join('\n'));
  }
  for (const section of sections) {
    parts.push(`## ${section.heading.trim()}\n\n${section.body.trim()}`);
  }
  return parts.join('\n\n');
}
