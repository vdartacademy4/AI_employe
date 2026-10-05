import type { PaginatedMeta } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

const ACCESS_TOKEN_KEY = 'aiep.accessToken';
const REFRESH_TOKEN_KEY = 'aiep.refreshToken';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages, when the backend returned a validation issue list. */
  get fieldErrors(): string[] {
    if (!Array.isArray(this.details)) return [];
    return this.details
      .map((detail) => {
        if (detail && typeof detail === 'object' && 'path' in detail && 'message' in detail) {
          return `${String(detail.path)}: ${String(detail.message)}`;
        }
        return typeof detail === 'string' ? detail : null;
      })
      .filter((value): value is string => Boolean(value));
  }
}

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the automatic refresh-on-401, used by the refresh call itself. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Called when a refresh fails, so the app can drop a session that is no longer
 * valid. Set by the auth provider to avoid a circular import.
 */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

/**
 * Drops a session that was previously valid and has now expired.
 *
 * It is deliberately a no-op when no access token was ever stored. The app is
 * not gated, so a cold start legitimately issues a burst of requests that all
 * 401. Treating each one as a failed sign-in would clear the query cache, which
 * re-fires those same requests, which clears the cache again - a loop with no
 * session to recover. The 401 still propagates, so pages show their error state.
 */
function handleUnauthorized(): void {
  if (!tokenStore.getAccess()) return;
  tokenStore.clear();
  onAuthFailure?.();
}

/** In-flight refresh dedup: concurrent 401s trigger a single refresh. */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return false;

        const payload = (await response.json()) as { data: { accessToken: string; refreshToken: string } };
        tokenStore.set(payload.data.accessToken, payload.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        // Allow a new refresh on the next 401.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }

  return refreshPromise;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokenStore.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
}

/**
 * Core fetcher. On a 401 it attempts one token refresh and replays the request
 * exactly once, so a short-lived access token never surfaces as a logout.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await rawRequest(path, options);
    } else {
      handleUnauthorized();
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  return payload?.data as T;
}

/** Fetcher variant that also returns pagination metadata. */
export async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: PaginatedMeta }> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipRefresh) {
    if (await refreshSession()) {
      response = await rawRequest(path, options);
    } else {
      handleUnauthorized();
    }
  }

  if (response.status === 204) {
    return { data: undefined as T, meta: {} as PaginatedMeta };
  }

  const payload = (await response.json()) as { data: T; meta?: PaginatedMeta };

  if (!response.ok) {
    const error = payload as unknown as { error?: { code: string; message: string; details?: unknown } };
    throw new ApiError(
      response.status,
      error.error?.code ?? 'UNKNOWN_ERROR',
      error.error?.message ?? 'Request failed',
      error.error?.details,
    );
  }

  return { data: payload.data, meta: payload.meta ?? ({} as PaginatedMeta) };
}
