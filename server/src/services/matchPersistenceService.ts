import type { MatchHistoryRepository, MatchPlayerRecord } from '../repositories/matchHistoryRepository';
import type { Room } from '../game/engine';
import type { ProgressionRepository } from '../repositories/progressionRepository';

export class MatchPersistenceService {
  constructor(private readonly history: MatchHistoryRepository, private readonly progression: ProgressionRepository) {}
  async persist(room: Room): Promise<Array<{ userId: string; result: Awaited<ReturnType<ProgressionRepository['recordMatch']>> }>> {
    if (room.status !== 'finished' || !room.startedAt) return [];
    const completedAt = new Date().toISOString();
    const finishedAt = Date.now();
    const players = [...room.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    const winnerId = players[0]?.userId;
    const configuration = JSON.stringify({ rounds: room.settings.rounds, roundSeconds: room.settings.roundSeconds, difficulty: room.settings.difficulty, wordMode: room.settings.wordMode, maxPlayers: room.settings.maxPlayers, visibility: room.settings.visibility });
    const writes = players.map(async (player, index) => {
      const placement = index + 1;
      const accountType = player.isGuest ? 'guest' : 'registered';
      const record: MatchPlayerRecord = {
        id: `${room.id}:${player.userId}`, matchId: room.id, roomId: room.id, roomCode: room.code, roomName: room.name,
        status: 'completed', startedAt: new Date(room.startedAt).toISOString(), completedAt,
        durationSeconds: Math.max(0, Math.floor((finishedAt - room.startedAt) / 1000)),
        playerId: player.userId, username: player.username.slice(0, 32), avatarId: player.avatarId.slice(0, 32), accountType,
        score: player.score, placement, isWinner: player.userId === winnerId, playerCount: players.length,
        roundsConfigured: room.settings.rounds, roundsCompleted: room.turnsCompleted, configuration,
      };
      const persisted = await this.history.append(record);
      // XP/stat writes are already idempotent by match and player transaction ID.
      const progression = await this.progression.recordMatch(room.id, { userId: player.userId, score: player.score, wins: player.userId === winnerId ? 1 : 0, correctGuesses: player.correctGuesses, totalGuesses: player.totalGuesses, place: placement });
      return { userId: player.userId, result: progression };
    });
    return Promise.all(writes);
  }
}
