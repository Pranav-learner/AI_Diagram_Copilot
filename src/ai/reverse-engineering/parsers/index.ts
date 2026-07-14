/**
 * The default parser set — every shipped language/format parser, assembled into a
 * {@link ParserRegistry}. New languages are added by writing a parser and listing it
 * here; the analysis/graph/PKM layers never change.
 */

import { ParserRegistry } from './ParserRegistry';
import type { LanguageParser } from './types';
import { typeScriptParser } from './TypeScriptParser';
import { pythonParser } from './PythonParser';
import { goParser } from './GoParser';
import { javaParser } from './JavaParser';
import { sqlParser } from './SqlParser';
import { dockerfileParser } from './DockerfileParser';
import { composeParser } from './ComposeParser';
import { kubernetesParser } from './KubernetesParser';
import { terraformParser } from './TerraformParser';
import { openApiParser } from './OpenApiParser';
import { graphqlParser } from './GraphQLParser';
import { jsonSchemaParser } from './JsonSchemaParser';

export * from './types';
export * from './ParserRegistry';
export { detectLanguage } from './detect';
export {
  typeScriptParser,
  pythonParser,
  goParser,
  javaParser,
  sqlParser,
  dockerfileParser,
  composeParser,
  kubernetesParser,
  terraformParser,
  openApiParser,
  graphqlParser,
  jsonSchemaParser,
};

export const ALL_PARSERS: readonly LanguageParser[] = [
  typeScriptParser,
  pythonParser,
  goParser,
  javaParser,
  sqlParser,
  dockerfileParser,
  composeParser,
  kubernetesParser,
  terraformParser,
  openApiParser,
  graphqlParser,
  jsonSchemaParser,
];

/** A fresh registry populated with every default parser. */
export function defaultParserRegistry(): ParserRegistry {
  return new ParserRegistry().registerAll(ALL_PARSERS);
}
