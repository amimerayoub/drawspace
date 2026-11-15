import { randomUUID } from 'node:crypto';
import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from '../repositories/rowRepository';
import type { GameEngine, Room } from './engine';

export interface AdminRoomPlayer {
  userId: string; username: string; avatarId: string; score: number;
  ready: boolean; connected: boolean; host: boolean; isGuest: boolean; hasGuessed: boolean;
}
export interface AdminRoom {
  code: string; name: string; hostId: string; status: Room['status'];
  visibility: 'public' | 'private'; hasPassword: boolean;
  settings: { maxPlayers: number; rounds: number; roundSeconds: number; difficulty: string; wordMode: string };
  players: AdminRoomPlayer[]; playerCount: number; connectedCount: number;
  round: number; rounds: number; turnId: number; drawerUserId: string | null;
  startedAt: number;
}
export interface RoomAdminActor { userId: string; username: string; role: string }
export interface RoomAdminBroadcaster {
  roomClosed(room: Room): void;
  playerKicked(code: string, userId: string, socketId: string | null, room: Room | null): void;
}

export class RoomAdminService {
  private broadcaster: RoomAdminBroadcaster | null = null;
  private readonly audit: RowRepository;
  constructor(private readonly game: GameEngine, database: AppwriteDatabase) { this.audit = new RowRepository(database, 'audit_logs'); }

  setBroadcaster(broadcaster: RoomAdminBroadcaster) { this.broadcaster = broadcaster; }

  async list(): Promise<AdminRoom[]> {
    const rooms = await this.game.listAll();
    return rooms.filter((room) => room.status !== 'closed').map((room) => this.view(room)).sort((a, b) => b.startedAt - a.startedAt);
  }
  async get(code: string): Promise<AdminRoom> { return this.view(await this.game.get(code)); }

  async close(code: string, actor: RoomAdminActor, reason: string): Promise<AdminRoom> {
    const room = await this.game.adminClose(code);
    this.broadcaster?.roomClosed(room);
    await this.log(actor, 'room.close', room.code, `${room.name}: ${reason}`.slice(0, 255));
    return this.view(room);
  }
  async kick(code: string, userId: string, actor: RoomAdminActor, reason: string): Promise<AdminRoom | null> {
    const { room, socketId } = await this.game.adminKick(code, userId);
    this.broadcaster?.playerKicked(code, userId, socketId, room);
    await this.log(actor, 'room.kick', code, `${userId}: ${reason}`.slice(0, 255));
    return room ? this.view(room) : null;
  }

  private view(room: Room): AdminRoom {
    const players = [...room.players.values()].map(({ userId, username, avatarId, score, ready, connected, host, isGuest, hasGuessed }) => ({ userId, username, avatarId, score, ready, connected, host, isGuest, hasGuessed }));
    return {
      code: room.code, name: room.name, hostId: room.hostUserId, status: room.status,
      visibility: room.settings.visibility, hasPassword: Boolean(room.passwordHash),
      settings: { maxPlayers: room.settings.maxPlayers, rounds: room.settings.rounds, roundSeconds: room.settings.roundSeconds, difficulty: room.settings.difficulty, wordMode: room.settings.wordMode },
      players, playerCount: players.length, connectedCount: players.filter((player) => player.connected).length,
      round: room.round, rounds: room.settings.rounds, turnId: room.turnId, drawerUserId: room.drawerUserId,
      startedAt: room.startedAt,
    };
  }
  private async log(actor: RoomAdminActor, action: string, code: string, reason: string) {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32), actorRole: actor.role, action, ipAddress: '', resourceType: 'room', resourceId: code, status: 'success', reason, createdAt: new Date().toISOString() });
  }
}