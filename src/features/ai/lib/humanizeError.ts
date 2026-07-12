/**
 * Error experience — turn an {@link AIError} (or anything thrown) into a clear,
 * recoverable message: a human explanation, a suggested fix, and expandable
 * technical detail (shown in debug mode). One place, so every surface shows the
 * same helpful copy.
 */

import {
  AIError,
  AIConfigError,
  TimeoutError,
  CancelledError,
  RateLimitError,
  ResponseValidationError,
  ProviderError,
  NetworkError,
  EditError,
  GenerationError,
  PlanningError,
} from '@/ai';

export interface HumanError {
  /** Short, human-readable explanation. */
  readonly message: string;
  /** A concrete next step the user can take. */
  readonly suggestion: string;
  /** Whether a retry is likely to help. */
  readonly retryable: boolean;
  /** Raw technical detail (error name + message) for debug mode. */
  readonly technical: string;
}

export function humanizeError(err: unknown): HumanError {
  const technical = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const retryable = err instanceof AIError ? err.retryable : true;

  if (err instanceof CancelledError) {
    return { message: 'Request cancelled.', suggestion: 'Send it again when you are ready.', retryable: true, technical };
  }
  if (err instanceof AIConfigError) {
    return {
      message: 'No AI provider is configured.',
      suggestion: 'Add an API key (or use demo mode) in AI Settings.',
      retryable: false,
      technical,
    };
  }
  if (err instanceof RateLimitError) {
    return { message: 'The AI provider is rate limiting requests.', suggestion: 'Wait a few seconds and retry.', retryable: true, technical };
  }
  if (err instanceof TimeoutError) {
    return { message: 'The request timed out.', suggestion: 'Retry, or simplify your request.', retryable: true, technical };
  }
  if (err instanceof NetworkError) {
    return { message: 'Could not reach the AI provider.', suggestion: 'Check your connection and retry.', retryable: true, technical };
  }
  if (err instanceof ResponseValidationError || err instanceof GenerationError) {
    return {
      message: 'The AI response could not be turned into a valid diagram.',
      suggestion: 'Rephrase your request or add more detail, then retry.',
      retryable: true,
      technical,
    };
  }
  if (err instanceof EditError) {
    return {
      message: err.message,
      suggestion: 'Try naming the element more specifically, or select it first.',
      retryable: true,
      technical,
    };
  }
  if (err instanceof PlanningError) {
    return { message: 'The plan could not be turned into runtime operations.', suggestion: 'Retry or rephrase.', retryable: true, technical };
  }
  if (err instanceof ProviderError) {
    return { message: 'The AI provider returned an error.', suggestion: 'Retry in a moment.', retryable: true, technical };
  }
  return {
    message: err instanceof Error && err.message ? err.message : 'Something went wrong.',
    suggestion: 'Please try again.',
    retryable,
    technical,
  };
}
