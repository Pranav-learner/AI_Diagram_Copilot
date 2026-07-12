import { describe, it, expect } from 'vitest';
import { createGenerationHandler } from '../GenerationHandler';
import { GenerationError } from '../errors';
import { samplePlan } from './helpers';
import { createDefaultOperationRegistry } from '@/diagram-engine';

const KNOWN = new Set(createDefaultOperationRegistry().types());

describe('GenerationHandler', () => {
  const handler = createGenerationHandler();

  it('advertises the generate intent, a schema, and an inline prompt template', () => {
    expect(handler.intent).toBe('generate');
    expect(handler.schema).toBeDefined();
    expect(typeof handler.promptTemplate).toBe('object');
    expect(handler.toOperations).toBeInstanceOf(Function);
  });

  it('compiles a valid plan into known runtime operations', () => {
    const plan = handler.toOperations!(samplePlan(), { input: { text: 'x' }, classification: { intent: 'generate', confidence: 1 } });
    expect(plan.operations.length).toBeGreaterThan(0);
    for (const op of plan.operations) expect(KNOWN.has(op.type)).toBe(true);
  });

  it('rejects a semantically-invalid plan (dangling relationship)', () => {
    const bad = samplePlan({ relationships: [{ source: 'a', target: 'nope' }] });
    expect(() => handler.toOperations!(bad, { input: { text: 'x' }, classification: { intent: 'generate', confidence: 1 } })).toThrow(GenerationError);
  });
});
