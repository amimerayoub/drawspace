import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export interface AnalyticsTopPlayer { userId: string; username: string; avatarId: string; xp: number; level: number; wins: number }
export interface PlatformAnalytics {
  range: { days: number; from: string; to: string };
  totals: { users: number | null; activeUsers: number | null; matches: number | null; wordsGuessed: number; xpAwarded: number };
  series: { labels: string[]; signups: number[]; matches: number[]; xp: number[] };
  locales: { locale: string; count: number }[];
  accountTypes: { registered: number; guest: number };
  topPlayers: AnalyticsTopPlayer[];
  matchesAvailable: boolean;
  generatedAt: string;
}

// Aggregates are computed over bounded reads of existing production tables. A missing
// table (match_history before its migration) degrades to null/empty instead of failing.
const MAX_ROWS = 5000;
const DAY_MS = 86_400_000;

export class AnalyticsRepository {
  constructor(private readonly database: AppwriteDatabase) {}

  async get(days = 14): Promise<PlatformAnalytics> {
    const span = Math.min(90, Math.max(7, Math.floor(days) || 14));
    const now = new Date();
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const keys: string[] = [];
    const labels: string[] = [];
    for (let i = span - 1; i >= 0; i -= 1) {
      const day = new Date(todayUTC - i * DAY_MS);
      keys.push(day.toISOString().slice(0, 10));
      labels.push(day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
    }
    const index = new Map(keys.map((key, i) => [key, i]));
    const from = new Date(todayUTC - (span - 1) * DAY_MS).toISOString();

    const [profiles, statistics, progressions, preferences, transactions, matchRows, userTotal, userActive, matchTotal] = await Promise.all([
      this.safeList('profiles'),
      this.safeList('user_statistics'),
      this.safeList('player_progression'),
      this.safeList('user_preferences'),
      this.safeList('xp_transactions'),
      this.safeList('match_history'),
      this.countUsers(false),
      this.countUsers(true),
      this.safeCount('match_history'),
    ]);

    const countByDay = (rows: Row[], field: string) => {
      const out = new Array<number>(span).fill(0);
      for (const row of rows) { const i = index.get(String(row[field] || '').slice(0, 10)); if (i !== undefined) out[i] += 1; }
      return out;
    };
    const xp = new Array<number>(span).fill(0);
    for (const row of transactions) { const i = index.get(String(row.createdAt || '').slice(0, 10)); if (i !== undefined) xp[i] += Number(row.amount) || 0; }

    const wordsGuessed = statistics.reduce((sum, row) => sum + (Number(row.correctGuesses) || 0), 0);
    const xpAwarded = transactions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

    const localeCounts = new Map<string, number>();
    for (const row of preferences) { const locale = String(row.language || 'en-US'); localeCounts.set(locale, (localeCounts.get(locale) || 0) + 1); }
    const locales = [...localeCounts.entries()].map(([locale, count]) => ({ locale, count })).sort((a, b) => b.count - a.count || a.locale.localeCompare(b.locale)).slice(0, 8);

    let registered = 0;
    let guest = 0;
    for (const row of profiles) { if (row.accountType === 'guest') guest += 1; else registered += 1; }

    const profileById = new Map(profiles.map((row) => [String(row.userId), row]));
    const statsById = new Map(statistics.map((row) => [String(row.userId), row]));
    const topPlayers = progressions.map((row) => {
      const userId = String(row.userId);
      const profile = profileById.get(userId);
      return { userId, username: String(profile?.username || profile?.displayName || 'Player'), avatarId: String(profile?.avatarId || 'av-01'), xp: Number(row.totalXP) || 0, level: Number(row.currentLevel) || 1, wins: Number(statsById.get(userId)?.gamesWon) || 0 };
    }).sort((a, b) => b.xp - a.xp || b.wins - a.wins).slice(0, 10);

    return {
      range: { days: span, from, to: now.toISOString() },
      totals: { users: userTotal, activeUsers: userActive, matches: matchTotal, wordsGuessed, xpAwarded },
      series: { labels, signups: countByDay(profiles, 'createdAt'), matches: countByDay(matchRows, 'completedAt'), xp },
      locales,
      accountTypes: { registered, guest },
      topPlayers,
      matchesAvailable: matchTotal !== null,
      generatedAt: now.toISOString(),
    };
  }

  private async safeList(table: string): Promise<Row[]> {
    try { return await new RowRepository(this.database, table).list([Query.limit(MAX_ROWS)]); }
    catch { return []; }
  }
  private async safeCount(table: string): Promise<number | null> {
    try { const result = await this.database.tables.listRows(this.database.databaseId, table, [Query.limit(1)]); return typeof result.total === 'number' ? result.total : null; }
    catch { return null; }
  }
  private async countUsers(activeOnly: boolean): Promise<number | null> {
    try {
      const queries = activeOnly ? [Query.equal('status', true), Query.limit(1)] : [Query.limit(1)];
      const result = await this.database.users.list({ queries, total: true });
      return typeof result.total === 'number' ? result.total : null;
    } catch { return null; }
  }
}