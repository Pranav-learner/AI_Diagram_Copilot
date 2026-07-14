/**
 * ParserRegistry — the pluggable language-parser dispatcher.
 *
 * Parsers register the languages they handle; the registry detects the language of
 * an input (path + content) and routes to the right parser, returning a
 * {@link ParseResult}. A parser that throws is caught and reported as a failed parse
 * (never fatal). This is the single seam through which new languages are added.
 */

import type { Language } from '../ast/NormalizedAST';
import { detectLanguage } from './detect';
import type { LanguageParser, ParseInput, ParseResult } from './types';

export class ParserRegistry {
  private readonly byLanguage = new Map<Language, LanguageParser>();

  register(parser: LanguageParser): this {
    for (const language of parser.languages) this.byLanguage.set(language, parser);
    return this;
  }

  registerAll(parsers: Iterable<LanguageParser>): this {
    for (const p of parsers) this.register(p);
    return this;
  }

  get(language: Language): LanguageParser | undefined {
    return this.byLanguage.get(language);
  }

  languages(): readonly Language[] {
    return [...this.byLanguage.keys()];
  }

  detect(path: string, content: string): Language {
    return detectLanguage(path, content);
  }

  /** Detect + parse. Returns a failed result (never throws) when unsupported/broken. */
  parse(input: ParseInput): ParseResult {
    const language = input.language ?? detectLanguage(input.path, input.content);
    const parser = this.byLanguage.get(language);
    if (!parser) return { language, ok: false, errors: [`no parser registered for language "${language}"`] };
    try {
      return parser.parse({ ...input, language });
    } catch (e) {
      return { language, ok: false, errors: [`parser "${parser.id}" failed: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
}
