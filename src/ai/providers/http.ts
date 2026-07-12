/**
 * The injectable HTTP transport shared by the real providers.
 *
 * Providers never call `fetch` directly — they call an {@link HttpTransport}.
 * This keeps them testable without a network (inject a fake transport in tests)
 * and swappable (a proxy, a signed-request wrapper, a recording transport). The
 * default {@link fetchTransport} adapts the platform `fetch`, normalizing its
 * failure modes into the AI error family so retry classification works.
 */

import { NetworkError, CancelledError } from '../core/AIError';

export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  /** Already-serialized request body (JSON string), if any. */
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  /** Fully-read response body as text. */
  text(): Promise<string>;
  /** Async iterator over decoded body chunks, for streaming (SSE). */
  stream(): AsyncIterable<string>;
}

/** A function that performs an HTTP request. The unit of injection/mocking. */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** Adapt the platform `fetch` into an {@link HttpTransport}. */
export const fetchTransport: HttpTransport = async (request) => {
  let res: Response;
  try {
    res = await fetch(request.url, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body,
      signal: request.signal,
    });
  } catch (err) {
    // fetch rejects on abort and on network failure — distinguish them.
    if (isAbort(err)) throw new CancelledError();
    throw new NetworkError(err instanceof Error ? err.message : 'network request failed', { cause: err });
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: res.status,
    ok: res.ok,
    headers,
    text: () => res.text(),
    stream: () => decodeBody(res),
  };
};

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** Decode a fetch response body into a stream of UTF-8 string chunks. */
async function* decodeBody(res: Response): AsyncIterable<string> {
  const body = res.body;
  if (!body) {
    const text = await res.text();
    if (text) yield text;
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a stream of raw text chunks as Server-Sent Events, yielding each
 * event's `data:` payload. Used by OpenAI/Anthropic/local SSE streaming. Buffers
 * across chunk boundaries so multi-chunk events are reassembled correctly.
 */
export async function* parseSSE(chunks: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += chunk;
    let sep: number;
    // Events are separated by a blank line (\n\n). Emit each complete event.
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = extractData(rawEvent);
      if (data !== undefined) yield data;
    }
  }
  const data = extractData(buffer);
  if (data !== undefined) yield data;
}

/** Concatenate the `data:` lines of a single SSE event block. */
function extractData(rawEvent: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of rawEvent.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).trimStart());
  }
  return dataLines.length ? dataLines.join('\n') : undefined;
}
