/**
 * ResponseValidator — the "never trust the model" gate.
 *
 * Raw model text is coerced to JSON (tolerating the markdown code fences and
 * surrounding prose LLMs routinely emit), then validated against a zod schema.
 * A self-reported `confidence` below the configured floor is a validation
 * failure too. Output is a discriminated result — callers branch on `ok` — with
 * a strict variant that throws {@link ResponseValidationError}. Every failure is
 * recorded to {@link AIMetrics}. No structured value enters the pipeline without
 * passing through here.
 */

import type { z } from 'zod';
import type { AIIssue } from '../core/types';
import { aiIssue } from '../core/types';
import { ResponseValidationError } from '../core/AIError';
import type { AIMetrics } from '../observability/AIMetrics';
import { noopMetrics } from '../observability/AIMetrics';

export interface ValidationSuccess<T> {
  readonly ok: true;
  readonly value: T;
}
export interface ValidationFailure {
  readonly ok: false;
  readonly issues: readonly AIIssue[];
}
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface ValidateOptions {
  /** Reject values whose numeric `confidence` field is below this. */
  readonly minConfidence?: number;
}

export interface ResponseValidatorDeps {
  readonly metrics?: AIMetrics;
  readonly defaultMinConfidence?: number;
}

export class ResponseValidator {
  private readonly metrics: AIMetrics;
  private readonly defaultMinConfidence: number;

  constructor(deps: ResponseValidatorDeps = {}) {
    this.metrics = deps.metrics ?? noopMetrics;
    this.defaultMinConfidence = deps.defaultMinConfidence ?? 0;
  }

  /** Validate raw model text against `schema`. Returns a result; never throws. */
  validate<T>(raw: string, schema: z.ZodType<T>, opts: ValidateOptions = {}): ValidationResult<T> {
    const parsed = extractJSON(raw);
    if (!parsed.ok) return this.fail([aiIssue('malformed_json', parsed.error)]);

    const result = schema.safeParse(parsed.value);
    if (!result.success) return this.fail(result.error.issues.map(toIssue));

    const min = opts.minConfidence ?? this.defaultMinConfidence;
    const confidence = readConfidence(result.data);
    if (confidence !== undefined && confidence < min) {
      return this.fail([
        aiIssue('low_confidence', `confidence ${confidence} is below the minimum ${min}`, 'confidence'),
      ]);
    }
    return { ok: true, value: result.data };
  }

  /** Like {@link validate} but throws {@link ResponseValidationError} on failure. */
  validateOrThrow<T>(raw: string, schema: z.ZodType<T>, opts: ValidateOptions = {}): T {
    const result = this.validate(raw, schema, opts);
    if (result.ok) return result.value;
    throw new ResponseValidationError(
      'model response failed validation',
      result.issues.map((i) => `${i.path ?? '<root>'}: ${i.message}`),
      raw.slice(0, 500),
    );
  }

  private fail(issues: readonly AIIssue[]): ValidationFailure {
    this.metrics.recordValidationFailure();
    return { ok: false, issues };
  }
}

/** The subset of a zod issue we consume — structural, to avoid version-coupling. */
interface ZodLikeIssue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
  readonly code: string;
}

/** Map a zod issue to the AI layer's {@link AIIssue}. */
function toIssue(issue: ZodLikeIssue): AIIssue {
  const path = issue.path.map((p) => String(p)).join('.');
  return aiIssue(issue.code, issue.message, path || undefined);
}

/** Read a top-level numeric `confidence`, if present. */
function readConfidence(value: unknown): number | undefined {
  if (value && typeof value === 'object' && 'confidence' in value) {
    const c = (value as { confidence: unknown }).confidence;
    if (typeof c === 'number') return c;
  }
  return undefined;
}

interface ExtractOk {
  readonly ok: true;
  readonly value: unknown;
}
interface ExtractErr {
  readonly ok: false;
  readonly error: string;
}

/**
 * Best-effort extraction of a JSON value from model text: strips ```json fences
 * and any prose before/after the outermost JSON object/array, then parses.
 */
export function extractJSON(raw: string): ExtractOk | ExtractErr {
  const trimmed = stripFences(raw).trim();
  if (!trimmed) return { ok: false, error: 'empty response' };

  // Fast path: the whole thing is valid JSON.
  const direct = tryParse(trimmed);
  if (direct.ok) return direct;

  // Fallback: carve out the first balanced {...} or [...] span.
  const span = firstJSONSpan(trimmed);
  if (span) {
    const parsed = tryParse(span);
    if (parsed.ok) return parsed;
  }
  return { ok: false, error: 'response was not valid JSON' };
}

function stripFences(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return fence?.[1] ?? text;
}

function tryParse(text: string): ExtractOk | ExtractErr {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'parse error' };
  }
}

/** Extract the first balanced JSON object/array span, ignoring braces in strings. */
function firstJSONSpan(text: string): string | undefined {
  const start = text.search(/[{[]/);
  if (start === -1) return undefined;
  const open = text[start]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
