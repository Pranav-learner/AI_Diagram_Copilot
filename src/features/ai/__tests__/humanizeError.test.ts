import { describe, it, expect } from 'vitest';
import { AIConfigError, TimeoutError, CancelledError, NetworkError, GenerationError, EditError } from '@/ai';
import { humanizeError } from '../lib/humanizeError';

describe('humanizeError', () => {
  it('explains a missing provider (not retryable)', () => {
    const h = humanizeError(new AIConfigError('no key'));
    expect(h.message).toMatch(/provider/i);
    expect(h.suggestion).toMatch(/API key|Settings/i);
    expect(h.retryable).toBe(false);
  });

  it('marks timeouts and network errors retryable', () => {
    expect(humanizeError(new TimeoutError(1000)).retryable).toBe(true);
    expect(humanizeError(new NetworkError('down')).retryable).toBe(true);
  });

  it('treats cancellation gently', () => {
    expect(humanizeError(new CancelledError()).message).toMatch(/cancel/i);
  });

  it('gives rephrase guidance for generation/edit failures', () => {
    expect(humanizeError(new GenerationError('bad', 'validating')).suggestion).toMatch(/rephrase|detail/i);
    const edit = humanizeError(new EditError('Could not find node', 'validating'));
    expect(edit.message).toBe('Could not find node');
  });

  it('carries technical detail for debug mode', () => {
    expect(humanizeError(new TimeoutError(500)).technical).toMatch(/TimeoutError/);
    expect(humanizeError('weird').technical).toBe('weird');
  });
});
