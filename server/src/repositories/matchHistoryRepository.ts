import { createHash } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';

export interface MatchPlayerRecord {
  id: string; matchId: string; roomId: string; roomCode: string; roomName: string;
  status: 'completed'; startedAt: string; completedAt: string; durationSeconds: number;
  playerId: string; username: string; avatarId: string; accountType: 'guest' | 'registered';
  score: number; placement: number; isWinner: boolean; playerCount: number;
  roundsConfigured: number; roundsCompleted: number; configuration: string;
}
export interface MatchHistoryRepository {
  append(record: MatchPlayerRecord): Promise<void>;
  listForUser(userId: string, limit: number, offset: number): Promise<{ rows: MatchPlayerRecord[]; total: number }>;
  listForPlayer(userId: string, limit: number, offset: number): Promise<{ rows: MatchPlayerRecord[]; total: number }>;
  getMatch(matchId: string): Promise<MatchPlayerRecord[]>;
  listAll(limit: number, offset: number): Promise<{ rows: MatchPlayerRecord[]; total: number }>;
}

const fromRow = (row: Record<string, unknown>): MatchPlayerRecord => ({
  id: String(row.$id || row.id), matchId: String(row.matchId), roomId: String(row.roomId), roomCode: String(row.roomCode), roomName: String(row.roomName),
  status: 'completed', startedAt: String(row.startedAt), completedAt: String(row.completedAt), durationSeconds: Number(row.durationSeconds),
  playerId: String(row.playerId), username: String(row.username), avatarId: String(row.avatarId), accountType: row.accountType === 'guest' ? 'guest' : 'registered',
  score: Number(row.score), placement: Number(row.placement), isWinner: row.isWinner === true, playerCount: Number(row.playerCount),
  roundsConfigured: Number(row.roundsConfigured), roundsCompleted: Number(row.roundsCompleted), configuration: String(row.configuration),
});

export class AppwriteMatchHistoryRepository implements MatchHistoryRepository {
  constructor(private readonly database: AppwriteDatabase, private readonly tableId = 'match_history') {}
  async append(record: MatchPlayerRecord): Promise<void> {
    const id = createHash('sha256').update(`${record.matchId}:${record.playerId}`).digest('hex').slice(0, 36);
    try {
      const { id: _id, ...data } = record;
      await this.database.tables.createRow(this.database.databaseId, this.tableId, id, {
        ...data,
      });
    } catch (error) {
      const existing = await this.database.tables.getRow(this.database.databaseId, this.tableId, id).catch(() => null);
      if (!existing) throw error;
      const stored = fromRow(existing as Record<string, unknown>);
      if (stored.matchId !== record.matchId || stored.playerId !== record.playerId) throw new Error('Match history deterministic ID collision.');
    }
  }
  async listForUser(userId: string, limit: number, offset: number) { return this.list([Query.equal('playerId', userId)], limit, offset); }
  async listForPlayer(userId: string, limit: number, offset: number) { return this.list([Query.equal('playerId', userId)], limit, offset); }
  async getMatch(matchId: string) { const result = await this.database.tables.listRows(this.database.databaseId, this.tableId, [Query.equal('matchId', matchId), Query.orderAsc('placement'), Query.limit(100)]); return result.rows.map((row) => fromRow(row as Record<string, unknown>)); }
  async listAll(limit: number, offset: number) { return this.list([], limit, offset); }
  private async list(filters: string[], limit: number, offset: number) {
    const result = await this.database.tables.listRows(this.database.databaseId, this.tableId, [...filters, Query.orderDesc('completedAt'), Query.limit(limit), Query.offset(offset)]);
    return { rows: result.rows.map((row) => fromRow(row as Record<string, unknown>)), total: result.total };
  }
}

/** Mock/development adapter only. */
export class InMemoryMatchHistoryRepository implements MatchHistoryRepository {
  private rows = new Map<string, MatchPlayerRecord>();
  async append(record: MatchPlayerRecord) { const key = `${record.matchId}:${record.playerId}`; if (!this.rows.has(key)) this.rows.set(key, structuredClone(record)); }
  async listForUser(userId: string, limit: number, offset: number) { return this.list([userId], limit, offset); }
  async listForPlayer(userId: string, limit: number, offset: number) { return this.list([userId], limit, offset); }
  async getMatch(matchId: string) { return [...this.rows.values()].filter((row) => row.matchId === matchId).sort((a, b) => a.placement - b.placement).map((row) => structuredClone(row)); }
  async listAll(limit: number, offset: number) { return this.list(null, limit, offset); }
  private list(userIds: string[] | null, limit: number, offset: number) {
    const rows = [...this.rows.values()].filter((row) => !userIds || userIds.includes(row.playerId)).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return Promise.resolve({ rows: rows.slice(offset, offset + limit).map((row) => structuredClone(row)), total: rows.length });
  }
}
