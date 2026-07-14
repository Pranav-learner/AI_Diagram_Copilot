/**
 * Document Intelligence errors — phase-tagged.
 *
 * Most failures degrade rather than throw: a failing extractor is isolated (the
 * rest still run), and a malformed document is reported via {@link validateDocument}
 * rather than crashing ingestion. `DocumentIntelligenceError` is reserved for the
 * few unrecoverable cases (e.g. ingesting empty input).
 */

export type DocumentIntelligencePhase = 'parsing' | 'classification' | 'extraction' | 'indexing';

export class DocumentIntelligenceError extends Error {
  override readonly name = 'DocumentIntelligenceError';
  readonly phase: DocumentIntelligencePhase;

  constructor(message: string, phase: DocumentIntelligencePhase) {
    super(message);
    this.phase = phase;
  }
}
