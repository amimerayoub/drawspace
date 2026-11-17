import { getJwt, notifyAuthExpired } from '@/lib/jwtCache';

export const baseUrl = (import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message); this.name = 'ApiError';
  }
}

export interface RequestOptions extends RequestInit {
  auth?: 'required' | 'optional' | 'none';
  timeoutMs?: number;
  raw?: boolean;
}

interface Payload<T> { data?: T; error?: string; code?: string }

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = 'required', timeoutMs = 12_000, raw = false, signal, ...init } = options;
  const jwt = auth !== 'none' ? await getJwt() : null;
  if (auth === 'required' && !jwt) throw new ApiError('Please sign in to continue.', 401, 'AUTH_REQUIRED');

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const attempt = async (token: string | null) => {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const payload = await response.json().catch(() => null) as Payload<T> | null;
    return { response, payload };
  };
  try {
    let { response, payload } = await attempt(jwt);
    // One forced refresh + one retry on an invalid session; never loop.
    if (response.status === 401 && auth !== 'none' && payload?.code === 'AUTH_INVALID') {
      const fresh = await getJwt(true);
      if (fresh && fresh !== jwt) ({ response, payload } = await attempt(fresh));
      if (response.status === 401) notifyAuthExpired();
    }
    if (!response.ok) throw new ApiError(payload?.error || 'The request could not be completed.', response.status, payload?.code);
    if (raw) return payload as T;
    return (payload && 'data' in payload ? payload.data : payload) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(signal?.aborted ? 'Request cancelled.' : 'The server took too long to respond.', 0, 'TIMEOUT');
    throw new ApiError('Could not connect to the DrawSpace server.', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const apiGet = <T>(path: string, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string, body?: unknown, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });

export async function apiDownload(path: string, options: RequestOptions = {}): Promise<string> {
  const { auth = 'required', timeoutMs = 60_000, signal } = options;
  const jwt = auth !== 'none' ? await getJwt() : null;
  if (auth === 'required' && !jwt) throw new ApiError('Please sign in to continue.', 401, 'AUTH_REQUIRED');
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers();
  if (jwt) headers.set('Authorization', `Bearer ${jwt}`);
  try {
    const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, { headers, signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string; code?: string } | null;
      if (response.status === 401 && payload?.code === 'AUTH_INVALID') notifyAuthExpired();
      throw new ApiError(payload?.error || 'The export could not be completed.', response.status, payload?.code);
    }
    const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'drawspace-export';
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return filename;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(signal?.aborted ? 'Export cancelled.' : 'The export took too long to respond.', 0, 'TIMEOUT');
    throw new ApiError('Could not connect to the DrawSpace server.', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}