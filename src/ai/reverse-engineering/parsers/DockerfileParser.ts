/**
 * Dockerfile parser — extracts base image(s), exposed ports, env keys, workdir, and
 * entrypoint/cmd into a single normalized `container` node (multi-stage FROMs are
 * recorded in metadata).
 */

import { ASTBuilder } from '../ast/ASTBuilder';
import { basename, dirname } from '../util';
import type { LanguageParser, ParseInput, ParseResult } from './types';

export const dockerfileParser: LanguageParser = {
  id: 'dockerfile',
  languages: ['dockerfile'],
  parse(input: ParseInput): ParseResult {
    const b = new ASTBuilder(input.path, 'dockerfile', dirname(input.path) || basename(input.path));
    const images: string[] = [];
    const ports: string[] = [];
    const env: string[] = [];
    let workdir = '';
    let entrypoint = '';

    input.content.split('\n').forEach((raw) => {
      const line = raw.replace(/#.*$/, '').trim();
      let m: RegExpExecArray | null;
      if ((m = /^FROM\s+(\S+)/i.exec(line))) images.push(m[1]!);
      else if ((m = /^EXPOSE\s+(.+)/i.exec(line))) ports.push(...m[1]!.split(/\s+/));
      else if ((m = /^ENV\s+(\w+)/i.exec(line))) env.push(m[1]!);
      else if ((m = /^ARG\s+(\w+)/i.exec(line))) env.push(m[1]!);
      else if ((m = /^WORKDIR\s+(\S+)/i.exec(line))) workdir = m[1]!;
      else if ((m = /^(?:ENTRYPOINT|CMD)\s+(.+)/i.exec(line))) entrypoint = m[1]!;
    });

    const name = dirname(input.path).split('/').pop() || basename(input.path);
    b.add({
      kind: 'container',
      name: name || 'image',
      startLine: 1,
      endLine: input.content.split('\n').length,
      metadata: {
        baseImage: images[0] ?? '',
        stages: images,
        ports,
        env,
        ...(workdir ? { workdir } : {}),
        ...(entrypoint ? { entrypoint } : {}),
      },
    });
    return { language: 'dockerfile', ok: true, ast: b.build(), errors: [] };
  },
};
