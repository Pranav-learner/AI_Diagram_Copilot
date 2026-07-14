/**
 * The parser plug-in contract.
 *
 * A {@link LanguageParser} turns raw source into a {@link NormalizedAST} and nothing
 * else — no parser-specific types escape. New languages are added by registering a
 * new parser (see {@link ParserRegistry}); the analysis/graph/PKM layers never
 * change. This is the extensibility seam the spec requires ("future languages
 * through plugins", "parser-agnostic").
 */

import type { Language, NormalizedAST } from '../ast/NormalizedAST';

export interface ParseInput {
  readonly path: string;
  readonly content: string;
  /** Force a language; otherwise it is detected from path + content. */
  readonly language?: Language;
}

export interface ParseResult {
  readonly language: Language;
  readonly ok: boolean;
  readonly ast?: NormalizedAST;
  /** Fatal parse errors (the AST is absent). Non-fatal issues live in `ast.warnings`. */
  readonly errors: readonly string[];
}

export interface LanguageParser {
  readonly id: string;
  readonly languages: readonly Language[];
  parse(input: ParseInput): ParseResult;
}
