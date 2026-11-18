import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';
import { UserReadCache, invalidateUserCache } from './userReadCache';

export interface StatisticsRecord {
  userId: string;
  totalGames: number;
  gamesWon: number;
  totalGuesses: number;
  correctGuesses: number;
  totalPoints: number;
  winRate: number;
}

const SELECT_FIELDS = ['userId', 'totalGames', 'gamesWon', 'totalGuesses', 'correctGuesses', 'totalPoints'];

export class StatisticsRepository {
  private readonly rows: RowRepository;
  private readonly cache = new UserReadCache();
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'user_statistics'); }

  async get(userId: string): Promise<StatisticsRecord> {
    return this.cache.read(`user_statistics:${userId}`, async () => {
      const row = await this.rows.findOne('userId', userId, SELECT_FIELDS);
      return row ? this.fromRow(row) : { userId, totalGames: 0, gamesWon: 0, totalGuesses: 0, correctGuesses: 0, totalPoints: 0, winRate: 0 };
    });
  }

  async recordMatch(userId: string, delta: Omit<StatisticsRecord, 'userId' | 'winRate'>): Promise<StatisticsRecord> {
    // Write paths read fresh: the cached record may be up to 30 s old and lacks the row id.
    const row = await this.rows.findOne('userId', userId, SELECT_FIELDS);
    const previous = row ? this.fromRow(row) : await this.get(userId);
    const next = {
      userId,
      totalGames: previous.totalGames + delta.totalGames,
      gamesWon: previous.gamesWon + delta.gamesWon,
      totalGuesses: previous.totalGuesses + delta.totalGuesses,
      correctGuesses: previous.correctGuesses + delta.correctGuesses,
      totalPoints: previous.totalPoints + delta.totalPoints,
    };
    const now = new Date().toISOString();
    const data = { ...next, updatedAt: now, ...(row ? {} : { createdAt: now }) };
    if (row) await this.rows.patch(row.$id, data);
    else await this.rows.insert(data);
    invalidateUserCache(userId);
    return { ...next, winRate: next.totalGames ? Math.round((next.gamesWon / next.totalGames) * 100) : 0 };
  }

  private fromRow(row: Row): StatisticsRecord {
    const totalGames = Number(row.totalGames) || 0;
    const gamesWon = Number(row.gamesWon) || 0;
    return {
      userId: String(row.userId), totalGames, gamesWon,
      totalGuesses: Number(row.totalGuesses) || 0,
      correctGuesses: Number(row.correctGuesses) || 0,
      totalPoints: Number(row.totalPoints) || 0,
      winRate: totalGames ? Math.round((gamesWon / totalGames) * 100) : 0,
    };
  }
}