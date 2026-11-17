import { appwriteAccount } from './appwrite';

/* In-memory JWT cache. Tokens are never persisted or logged. Parallel
   callers share one refresh; a token is reused until under 60s of life left. */

export const AUTH_EXPIRED_EVENT = 'drawspace:auth-expired';

interface CachedJwt { token: string; exp: number }
let cached: CachedJwt | null = null;
let inFlight: Promise<string | null> | null = null;

function decodeExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch { return null; }
}

export function invalidateJwt(): void { cached = null; }

export function notifyAuthExpired(): void {
  invalidateJwt();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

export async function getJwt(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cached && cached.exp - Date.now() / 1000 > 60) return cached.token;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { jwt } = await appwriteAccount.createJWT();
      const exp = decodeExp(jwt);
      cached = exp ? { token: jwt, exp } : null;
      return jwt;
    } catch {
      cached = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}