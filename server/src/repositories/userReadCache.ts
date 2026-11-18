const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 5_000;
const CATALOG_TTL_MS = 60_000;

interface Entry { value: unknown; expiresAt: number }

const liveCaches = new Set<UserReadCache>();

// The HTTP app and the socket handlers own separate repository instances; a write in one
// must evict cached reads in the other, so invalidation broadcasts to every live cache.
export function invalidateUserCache(userId: string): void {
  for (const cache of liveCaches) cache.invalidateUser(userId);
}

export function invalidateCatalogCaches(): void {
  for (const cache of liveCaches) cache.invalidateCatalogs();
}

export class UserReadCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly generations = new Map<string, number>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS, private readonly maxEntries = DEFAULT_MAX_ENTRIES) {
    liveCaches.add(this);
  }

  read<T>(key: string, loader: () => Promise<T>, ttlMs = this.ttlMs): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T);
    if (hit) this.entries.delete(key);
    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const generation = this.generations.get(key) ?? 0;
    const promise = loader().then((value) => {
      this.inFlight.delete(key);
      // A write landed mid-load; the fetched value predates it, so load again.
      if ((this.generations.get(key) ?? 0) !== generation) return this.read(key, loader, ttlMs);
      this.entries.delete(key);
      this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      this.evict();
      return value;
    }, (error) => {
      this.inFlight.delete(key);
      throw error;
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  readCatalog<T>(name: string, loader: () => Promise<T>): Promise<T> {
    return this.read(`catalog:${name}`, loader, CATALOG_TTL_MS);
  }

  invalidateUser(userId: string): void {
    this.invalidateMatching((key) => key.endsWith(`:${userId}`));
  }

  invalidateCatalogs(): void {
    // Dashboards and the leaderboard embed catalog rows, so a catalog edit expires them too.
    this.invalidateMatching((key) => key.startsWith('catalog:') || key.startsWith('dashboard:') || key.startsWith('leaderboard:'));
  }

  private invalidateMatching(matches: (key: string) => boolean): void {
    const keys = new Set([...this.entries.keys(), ...this.inFlight.keys()]);
    for (const key of keys) {
      if (!matches(key)) continue;
      this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
      this.entries.delete(key);
    }
  }

  private evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}