import { createHash } from 'node:crypto';
import type { AppwriteDatabase } from '../database/appwrite';
import type { AuthenticatedIdentity } from '../types/identity';

export type JwtVerifier = (jwt: string) => Promise<AuthenticatedIdentity>;

export interface JwtVerifierOptions { maxCacheMs?: number; maxEntries?: number }

const DEFAULT_MAX_CACHE_MS = 10 * 60_000;
const DEFAULT_MAX_ENTRIES = 5000;

interface CacheEntry { identity: AuthenticatedIdentity; expiresAt: number }

function decodeExpMs(jwt: string): number | null {
  try {
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch { return null; }
}

// Appwrite Cloud does not expose the JWT signing secret, so verification is cached
// (token hash -> identity) until the token expires, capped at maxCacheMs.
export function createJwtVerifier(database: AppwriteDatabase, options: JwtVerifierOptions = {}): JwtVerifier {
  const maxCacheMs = options.maxCacheMs ?? DEFAULT_MAX_CACHE_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<AuthenticatedIdentity>>();

  const evict = () => {
    const now = Date.now();
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  return async (jwt) => {
    const key = createHash('sha256').update(jwt).digest('hex');
    const now = Date.now();
    const hit = cache.get(key);
    if (hit) {
      if (hit.expiresAt > now) return hit.identity;
      cache.delete(key);
    }
    const pending = inFlight.get(key);
    if (pending) return pending;
    const expMs = decodeExpMs(jwt);
    if (expMs !== null && expMs <= now) throw new Error('Token expired');
    const promise = (async () => {
      const account = await database.accountForJwt(jwt).get();
      const identity: AuthenticatedIdentity = {
        userId: account.$id,
        name: account.name || 'Player',
        email: account.email || null,
        emailVerified: Boolean(account.emailVerification),
        isGuest: !account.email,
      };
      cache.set(key, { identity, expiresAt: Math.min(expMs ?? now + maxCacheMs, now + maxCacheMs) });
      if (cache.size > maxEntries) evict();
      return identity;
    })();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  };
}