import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export interface StatisticsRecord {
  userId: string;
  totalGames: number;
  gamesWon: number;
  totalGuesses: number;
  correctGuesses: number;
  totalPoints: number;
  winRate: number;
}

export class StatisticsRepository {
  private readonly rows: RowRepository;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'user_statistics'); }

  async get(userId: string): Promise<StatisticsRecord> {
    const row = await this.rows.findOne('userId', userId);
    return row ? this.fromRow(row) : { userId, totalGames: 0, gamesWon: 0, totalGuesses: 0, correctGuesses: 0, totalPoints: 0, winRate: 0 };
  }

  async recordMatch(userId: string, delta: Omit<StatisticsRecord, 'userId' | 'winRate'>): Promise<StatisticsRecord> {
    const row = await this.rows.findOne('userId', userId);
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
