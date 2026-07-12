import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ResponseValidator, extractJSON } from '../validation/ResponseValidator';
import { ResponseValidationError } from '../core/AIError';
import { AIMetrics } from '../observability/AIMetrics';

const schema = z.object({ answer: z.string(), confidence: z.number() });

describe('extractJSON', () => {
  it('parses bare JSON', () => {
    expect(extractJSON('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
  it('strips markdown fences', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });
  it('carves JSON out of surrounding prose', () => {
    const result = extractJSON('Sure! Here you go: {"a": {"b": 2}} — hope that helps');
    expect(result).toEqual({ ok: true, value: { a: { b: 2 } } });
  });
  it('does not split on braces inside strings', () => {
    expect(extractJSON('{"text": "a } b"}')).toEqual({ ok: true, value: { text: 'a } b' } });
  });
  it('fails on non-JSON', () => {
    expect(extractJSON('no json here').ok).toBe(false);
  });
});

describe('ResponseValidator', () => {
  it('validates a well-formed response', () => {
    const result = new ResponseValidator().validate('{"answer":"hi","confidence":0.9}', schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.answer).toBe('hi');
  });

  it('reports schema issues without throwing', () => {
    const result = new ResponseValidator().validate('{"answer":1}', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects responses below the confidence floor', () => {
    const result = new ResponseValidator().validate('{"answer":"x","confidence":0.1}', schema, { minConfidence: 0.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe('low_confidence');
  });

  it('records validation failures to metrics', () => {
    const metrics = new AIMetrics();
    new ResponseValidator({ metrics }).validate('garbage', schema);
    expect(metrics.snapshot().validationFailures).toBe(1);
  });

  it('validateOrThrow throws ResponseValidationError with issues', () => {
    expect(() => new ResponseValidator().validateOrThrow('{}', schema)).toThrow(ResponseValidationError);
  });
});
