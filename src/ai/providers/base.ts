/**
 * Shared plumbing for HTTP-backed providers.
 *
 * The vendor-specific request/response mapping lives in each provider; the
 * cross-cutting concerns that are identical everywhere — transport injection,
 * api-key resolution, and turning a non-2xx HTTP status into the right
 * {@link AIError} subtype (so retry classification is uniform) — live here.
 */

import { AIConfigError, ProviderError, RateLimitError } from '../core/AIError';
import type { HttpResponse, HttpTransport } from './http';
import { fetchTransport } from './http';

export interface HttpProviderConfig {
  /** API key. Read from the environment/secret store by the app, injected here. */
  readonly apiKey?: string;
  /** Override the API base URL (proxies, self-hosted gateways, test servers). */
  readonly baseURL?: string;
  /** The transport to use. Defaults to {@link fetchTransport}. */
  readonly transport?: HttpTransport;
  /** Extra headers merged into every request. */
  readonly headers?: Readonly<Record<string, string>>;
}

export function resolveTransport(config: HttpProviderConfig): HttpTransport {
  return config.transport ?? fetchTransport;
}

export function requireKey(providerId: string, config: HttpProviderConfig): string {
  if (!config.apiKey) {
    throw new AIConfigError(`Provider "${providerId}" requires an apiKey but none was configured`);
  }
  return config.apiKey;
}

/**
 * Read a `Retry-After` header (seconds) into milliseconds, if present.
 */
function retryAfterMs(res: HttpResponse): number | undefined {
  const raw = res.headers['retry-after'];
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/**
 * Throw the appropriate {@link AIError} for a failed HTTP response. 429 becomes
 * a {@link RateLimitError}; everything else a {@link ProviderError} whose
 * `retryable` flag is derived from the status by {@link ProviderError}.
 */
export async function raiseForStatus(providerId: string, res: HttpResponse): Promise<never> {
  const body = await safeText(res);
  if (res.status === 429) throw new RateLimitError(providerId, retryAfterMs(res));
  throw new ProviderError(providerId, `HTTP ${res.status}: ${truncate(body, 500)}`, { status: res.status });
}

async function safeText(res: HttpResponse): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
