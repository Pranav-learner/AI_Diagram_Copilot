/**
 * Thin fetch wrapper for the backend API.
 *
 * Normalizes errors into a typed {@link ApiError} the UI can branch on (404,
 * 409, offline, …). The base URL defaults to `/api` (proxied to FastAPI in dev);
 * override with `VITE_API_URL` for other environments.
 */

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True for connection failures (no HTTP response received). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
}

interface ErrorBody {
  detail?: string;
  code?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'network', 'Network error — please check your connection.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (body ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      err.code ?? 'error',
      err.detail ?? response.statusText,
    );
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
