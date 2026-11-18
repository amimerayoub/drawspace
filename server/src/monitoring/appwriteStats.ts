// In-memory Appwrite call counters: per-minute buckets grouped by table, plus
// lifetime totals. Counts only - no payloads, tokens, or identifiers are stored.
const MINUTE_MS = 60_000;
const MAX_MINUTES = 60;

type MethodCounts = Map<string, number>;
type TableCounts = Map<string, MethodCounts>;

const startedAt = new Date().toISOString();
const minutes = new Map<number, TableCounts>();
const totals: TableCounts = new Map();

function bump(bucket: TableCounts, table: string, method: string): void {
  let methods = bucket.get(table);
  if (!methods) { methods = new Map(); bucket.set(table, methods); }
  methods.set(method, (methods.get(method) ?? 0) + 1);
}

function prune(): void {
  const cutoff = Math.floor(Date.now() / MINUTE_MS) - MAX_MINUTES;
  for (const minute of minutes.keys()) if (minute <= cutoff) minutes.delete(minute);
}

export function recordAppwriteCall(table: string, method: string): void {
  const minute = Math.floor(Date.now() / MINUTE_MS);
  let bucket = minutes.get(minute);
  if (!bucket) { bucket = new Map(); minutes.set(minute, bucket); prune(); }
  bump(bucket, table, method);
  bump(totals, table, method);
}

export interface AppwriteTableStats { table: string; calls: number; methods: Record<string, number> }

function serialize(bucket: TableCounts): AppwriteTableStats[] {
  return [...bucket.entries()]
    .map(([table, methods]) => ({ table, calls: [...methods.values()].reduce((sum, value) => sum + value, 0), methods: Object.fromEntries(methods) }))
    .sort((a, b) => b.calls - a.calls);
}

export function appwriteStatsSnapshot() {
  prune();
  return {
    startedAt,
    windowMinutes: MAX_MINUTES,
    totals: serialize(totals),
    minutes: [...minutes.entries()].sort((a, b) => a[0] - b[0]).map(([minute, tables]) => ({ at: new Date(minute * MINUTE_MS).toISOString(), tables: serialize(tables) })),
  };
}

export function resetAppwriteStats(): void {
  minutes.clear();
  totals.clear();
}

// Logs one compact line per minute with activity, grouped by table. Started only
// by the server entry point so tests and tools stay silent.
export function startAppwriteStatsLogger(): void {
  let lastLogged = Math.floor(Date.now() / MINUTE_MS) - 1;
  const timer = setInterval(() => {
    const previous = Math.floor(Date.now() / MINUTE_MS) - 1;
    if (previous <= lastLogged) return;
    lastLogged = previous;
    const bucket = minutes.get(previous);
    if (!bucket || bucket.size === 0) return;
    const parts = serialize(bucket).map(({ table, calls }) => `${table}=${calls}`);
    console.info(`[appwrite-stats] ${new Date(previous * MINUTE_MS).toISOString()} ${parts.join(' ')}`);
  }, MINUTE_MS);
  timer.unref();
}