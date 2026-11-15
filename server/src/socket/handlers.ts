import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import type { JwtVerifier } from '../auth/verifyJwt';
import type { AppwriteDatabase } from '../database/appwrite';
import { GameEngine, GameError, type PlayerIdentity, type RoomSettings, type Stroke } from '../game/engine';
import type { RoomAdminBroadcaster } from '../game/roomAdmin';
import type { ProfileRepository } from '../repositories/profileRepository';
import { ProgressionRepository } from '../repositories/progressionRepository';
import { WordRepository } from '../repositories/wordRepository';
import type { AuthenticatedIdentity } from '../types/identity';
import type { GameSettingsRepository } from '../repositories/gameSettingsRepository';
import type { RoomStateStore } from '../state/roomStateStore';
import { MatchPersistenceService } from '../services/matchPersistenceService';
import { AppwriteMatchHistoryRepository } from '../repositories/matchHistoryRepository';

interface SocketDependencies {
  verify: JwtVerifier;
  game: GameEngine;
  profiles: ProfileRepository;
  wordsDatabase: AppwriteDatabase;
  gameSettings?: GameSettingsRepository;
  stateStore: RoomStateStore;
}
interface Ack { (result: { success: boolean; data?: unknown; error?: string; code?: string }): void }

const roomSettingsSchema = z.object({
  name: z.string().trim().max(32).default(''),
  visibility: z.enum(['public', 'private']).default('public'),
  password: z.string().min(4).max(64).optional(),
  maxPlayers: z.number().int().min(2).max(32).default(8),
  rounds: z.number().int().min(1).max(10).default(3),
  roundSeconds: z.number().int().min(30).max(180).default(80),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  wordMode: z.enum(['all', 'easy', 'medium', 'hard', 'custom']).default('all'),
  customWords: z.array(z.string().trim().min(2).max(32)).max(40).default([]),
}).strict().refine((settings) => settings.wordMode !== 'custom' || settings.customWords.length >= 2, 'Custom mode requires at least two words');
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const wordSchema = z.object({ id: z.string().min(1).max(64) }).strict();
const guessSchema = z.object({ text: z.string().trim().min(1).max(64) }).strict();
const strokeSchema = z.object({
  id: z.string().uuid(),
  tool: z.enum(['pen', 'eraser']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().min(1).max(48),
  points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()).min(1).max(500),
}).strict();

export async function createSocketHandlers(io: Server, deps: SocketDependencies): Promise<RoomAdminBroadcaster> {
  const words = new WordRepository(deps.wordsDatabase);
  const progression = new ProgressionRepository(deps.wordsDatabase);
  const roundTimeouts = new Map<string, NodeJS.Timeout>();
  const roundTicks = new Map<string, NodeJS.Timeout>();
  const choiceTimeouts = new Map<string, NodeJS.Timeout>();
  const disconnectGrace = new Map<string, NodeJS.Timeout>();
  const intermissions = new Map<string, NodeJS.Timeout>();
  const matchPersistence = new MatchPersistenceService(new AppwriteMatchHistoryRepository(deps.wordsDatabase), progression);
  const persistenceRetries = new Map<string, { after: number; attempts: number }>();
  const persistingMatches = new Set<string>();
  let settingsCache: { value: Awaited<ReturnType<GameSettingsRepository['get']>>; at: number } | null = null;
  const guessTimesByUser = new Map<string, number[]>();
  async function gameSettings() {
    if (!deps.gameSettings) return { maxPlayers: 12, guessRateLimitPerMinute: 60, chatRateLimitPerMinute: 30, allowCustomWords: true };
    if (!settingsCache || Date.now() - settingsCache.at > 5_000) settingsCache = { value: await deps.gameSettings.get(), at: Date.now() };
    return settingsCache.value;
  }
  const recoveredRooms = await deps.game.recover();

  io.use(async (socket, next) => {
    const jwt = socket.handshake.auth?.jwt;
    if (typeof jwt !== 'string' || !jwt) { next(new Error('Authentication required')); return; }
    try {
      const identity = await deps.verify(jwt);
      const profile = await deps.profiles.get(identity.userId);
      socket.data.identity = identity;
      socket.data.player = { userId: identity.userId, username: profile?.username || identity.name || 'Player', avatarId: profile?.avatarId || 'av-01', isGuest: identity.isGuest } satisfies PlayerIdentity;
      next();
    } catch { next(new Error('Invalid or expired session')); }
  });

  io.on('connection', (socket: Socket) => {
    const player = socket.data.player as PlayerIdentity;
    const identity = socket.data.identity as AuthenticatedIdentity;
    let activeRoomCode: string | null = null;
    const presenceHeartbeat = setInterval(() => { if (activeRoomCode) void deps.stateStore.touchPresence(activeRoomCode, identity.userId, 45, socket.id).catch(() => undefined); }, 15_000);
    presenceHeartbeat.unref();

    socket.on('room:create', async (payload: unknown, ack?: Ack) => {
      try {
        const limits = await gameSettings();
        const settings = roomSettingsSchema.parse(payload ?? {}) as RoomSettings;
        if (settings.maxPlayers > limits.maxPlayers) throw new GameError(`Room capacity cannot exceed ${limits.maxPlayers}.`, 'ROOM_CAPACITY_LIMIT');
        if (settings.wordMode === 'custom' && !limits.allowCustomWords) throw new GameError('Custom words are disabled by the game administrator.', 'CUSTOM_WORDS_DISABLED');
        const previous = await deps.game.roomForUser(identity.userId); const previousSocketId = previous?.players.get(identity.userId)?.lastSocketId;
        const room = await deps.game.createRoom(player, settings, socket.id);
        if (previous && previous.code !== room.code) await detachReplacedSocket(previous.code, identity.userId, previousSocketId, socket.id);
        activeRoomCode = room.code; await deps.stateStore.touchPresence(room.code, identity.userId, 45, socket.id);
        await socket.join(room.code);
        ack?.({ success: true, data: deps.game.publicRoom(room) });
        io.to(room.code).emit('room:update', deps.game.publicRoom(room));
      } catch (error) { respondError(ack, error); }
    });

    socket.on('room:join', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema, password: z.string().max(64).optional() }).strict().parse(payload);
        const previous = await deps.game.roomForUser(identity.userId); const previousSocketId = previous?.players.get(identity.userId)?.lastSocketId;
        const { room, reconnected } = await deps.game.join(parsed.code, player, socket.id, parsed.password);
        if (previous && (previous.code !== room.code || previousSocketId !== socket.id)) await detachReplacedSocket(previous.code, identity.userId, previousSocketId, socket.id);
        activeRoomCode = room.code; await deps.stateStore.touchPresence(room.code, identity.userId, 45, socket.id);
        const grace = disconnectGrace.get(identity.userId); if (grace) clearTimeout(grace);
        disconnectGrace.delete(identity.userId);
        await socket.join(room.code);
        ack?.({ success: true, data: { room: deps.game.publicRoom(room), reconnected } });
        io.to(room.code).emit('room:update', deps.game.publicRoom(room));
        if (room.status === 'choosing' && room.drawerUserId === identity.userId) {
          socket.emit('game:word-choices', deps.game.publicRoom(room, identity.userId).choices);
        } else if (room.status === 'drawing') {
          const answer = await deps.game.getRoundAnswer(room.code);
          socket.emit('game:round-start', { round: room.round, turnId: room.turnId, drawerUserId: room.drawerUserId, deadline: room.deadline, wordLength: answer?.length ?? 0 });
          if (room.drawerUserId === identity.userId) socket.emit('game:your-word', { word: answer });
          socket.emit('game:drawing-state', { strokes: deps.game.publicRoom(room).strokes, turnId: room.turnId });
        } else if (room.status === 'round_end' || room.status === 'finished') {
          socket.emit('game:round-end', { round: room.round, turnId: room.turnId, word: await deps.game.getRoundAnswer(room.code), scores: [...room.players.values()].map((player) => ({ userId: player.userId, score: player.score })) });
          if (room.status === 'finished') {
            const standings = [...room.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
            socket.emit('game:match-end', { roomCode: room.code, standings: standings.map((player, index) => ({ place: index + 1, userId: player.userId, username: player.username, avatarId: player.avatarId, score: player.score })) });
          }
        }
      } catch (error) { respondError(ack, error); }
    });

    socket.on('room:ready', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema, ready: z.boolean() }).strict().parse(payload);
        const room = await deps.game.setReady(parsed.code, identity.userId, parsed.ready, socket.id);
        io.to(room.code).emit('room:update', deps.game.publicRoom(room)); ack?.({ success: true });
      } catch (error) { respondError(ack, error); }
    });

    socket.on('room:start', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema }).strict().parse(payload);
        const { room, drawer } = await deps.game.start(parsed.code, identity.userId, socket.id);
        await offerWords(room.code, drawer.userId);
        io.to(room.code).emit('room:update', deps.game.publicRoom(room)); ack?.({ success: true });
      } catch (error) { respondError(ack, error); }
    });

    socket.on('game:choose-word', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema }).merge(wordSchema).strict().parse(payload);
        await chooseWord(parsed.code, identity.userId, parsed.id, socket.id);
        ack?.({ success: true });
      } catch (error) { respondError(ack, error); }
    });

    socket.on('game:guess', async (payload: unknown, ack?: Ack) => {
      try {
        const limits = await gameSettings(); const now = Date.now();
        const guessTimes = guessTimesByUser.get(identity.userId) || [];
        while (guessTimes.length && now - guessTimes[0] >= 60_000) guessTimes.shift();
        if (guessTimes.length >= Math.min(limits.guessRateLimitPerMinute, limits.chatRateLimitPerMinute)) throw new GameError('Please slow down.', 'GUESS_RATE_LIMIT');
        guessTimes.push(now); guessTimesByUser.set(identity.userId, guessTimes);
        const parsed = z.object({ code: codeSchema }).merge(guessSchema).strict().parse(payload);
        const result = await deps.game.guess(parsed.code, identity.userId, parsed.text, socket.id);
        if (result.correct) {
          io.to(result.room.code).emit('game:correct-guess', { userId: identity.userId, username: player.username, points: result.points });
          if (result.roundEnded) finishRound(result.room.code, result.word);
          else io.to(result.room.code).emit('room:update', deps.game.publicRoom(result.room));
          ack?.({ success: true, data: { correct: true, points: result.points } });
        } else {
          io.to(result.room.code).emit('game:chat', { userId: identity.userId, username: player.username, text: parsed.text, at: Date.now() });
          ack?.({ success: true, data: { correct: false } });
        }
      } catch (error) { respondError(ack, error); }
    });

    socket.on('game:stroke', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema, turnId: z.number().int().min(0) }).extend({ stroke: strokeSchema }).strict().parse(payload);
        const room = await deps.game.addStroke(parsed.code, identity.userId, parsed.stroke as Stroke, socket.id, parsed.turnId);
        io.to(room.code).emit('game:stroke', { stroke: parsed.stroke, turnId: room.turnId }); ack?.({ success: true });
      } catch (error) { respondError(ack, error); }
    });

    for (const action of ['undo', 'redo'] as const) {
      socket.on(`game:${action}`, async (payload: unknown, ack?: Ack) => {
        try {
          const parsed = z.object({ code: codeSchema }).strict().parse(payload);
          const room = await deps.game.replaceStrokes(parsed.code, identity.userId, action, socket.id);
          io.to(room.code).emit('game:drawing-state', { strokes: deps.game.publicRoom(room).strokes, turnId: room.turnId }); ack?.({ success: true });
        } catch (error) { respondError(ack, error); }
      });
    }
    socket.on('game:clear', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema }).strict().parse(payload);
        const room = await deps.game.clearDrawing(parsed.code, identity.userId, socket.id);
        io.to(room.code).emit('game:drawing-state', { strokes: [], turnId: room.turnId }); ack?.({ success: true });
      } catch (error) { respondError(ack, error); }
    });

    socket.on('room:leave', async (payload: unknown, ack?: Ack) => {
      try {
        const parsed = z.object({ code: codeSchema }).strict().parse(payload);
        const grace = disconnectGrace.get(identity.userId); if (grace) clearTimeout(grace);
        disconnectGrace.delete(identity.userId);
        const current = await deps.game.get(parsed.code);
        const drawerLeaving = current.status === 'drawing' && current.drawerUserId === identity.userId;
        const answer = drawerLeaving ? await deps.game.getRoundAnswer(parsed.code) ?? undefined : undefined;
        const room = await deps.game.leave(parsed.code, identity.userId, socket.id);
        await deps.stateStore.removePresence(parsed.code, identity.userId, socket.id); activeRoomCode = null;
        socket.leave(parsed.code);
        if (room && drawerLeaving) await finishRound(room.code, answer);
        else if (room) io.to(room.code).emit('room:update', deps.game.publicRoom(room));
        else clearTimers(parsed.code);
        ack?.({ success: true });
      } catch (error) { respondError(ack, error); }
    });

    socket.on('disconnect', async () => {
      clearInterval(presenceHeartbeat);
      try {
      const room = await deps.game.roomForUser(identity.userId);
      if (!room) return;
      const {room:updated,disconnected}=await deps.game.disconnect(room.code, identity.userId, socket.id);
      if(disconnected) await deps.stateStore.removePresence(room.code, identity.userId, socket.id).catch(() => undefined);
      if(!disconnected)return;
      const drawerDisconnected = room.status === 'drawing' && room.drawerUserId === identity.userId;
      const answer = drawerDisconnected ? await deps.game.getRoundAnswer(room.code) ?? undefined : undefined;
      if (updated && drawerDisconnected) await finishRound(updated.code, answer);
      else if (updated) io.to(updated.code).emit('room:update', deps.game.publicRoom(updated));
      if (updated?.players.has(identity.userId)) {
        const oldTimer = disconnectGrace.get(identity.userId); if (oldTimer) clearTimeout(oldTimer);
        const timer = setTimeout(async () => {
          const roomNow = await deps.game.roomForUser(identity.userId);
          if (!roomNow || roomNow.players.get(identity.userId)?.connected) { disconnectGrace.delete(identity.userId); return; }
          const remaining = await deps.game.leave(roomNow.code, identity.userId);
          if (remaining) io.to(remaining.code).emit('room:update', deps.game.publicRoom(remaining));
          disconnectGrace.delete(identity.userId);
        }, 60_000);
        timer.unref(); disconnectGrace.set(identity.userId, timer);
      }
      } catch (error) { console.error('[socket-disconnect-handler]', error instanceof Error ? error.name : 'unknown'); }
    });
  });

  async function offerWords(code: string, drawerId: string): Promise<void> {
    const room = await deps.game.get(code);
    const mode = room.settings.wordMode === 'all' ? room.settings.difficulty : room.settings.wordMode;
    const available = room.settings.wordMode === 'custom'
      ? room.settings.customWords.map((word) => ({ id: randomUUID(), word, category: 'Custom', difficulty: 'medium' }))
      : await words.active(mode);
    if (available.length < 2) throw new GameError('The word catalog does not have enough active words.', 'WORDS_UNAVAILABLE');
    const pool = [...available];
    for (let i = pool.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const choices = pool.slice(0, Math.min(3, pool.length)).map((item) => ({ id: item.id, word: item.word, category: item.category }));
    const updated = await deps.game.setWordChoices(code, drawerId, choices);
    io.to(updated.players.get(drawerId)?.lastSocketId ?? '').emit('game:word-choices', choices.map(({ id, word, category }) => ({ id, word, category })));
    const timeout = setTimeout(async () => {
      try {
        const current = await deps.game.get(code);
        const first = current.status === 'choosing' && current.drawerUserId === drawerId ? current.choices[0] : undefined;
        if (first) void chooseWord(code, drawerId, first.id);
      } catch { /* Room may have closed before the choice timeout. */ }
    }, 15_000);
    timeout.unref(); choiceTimeouts.set(code, timeout);
  }

  async function detachReplacedSocket(code:string,userId:string,socketId:string|undefined,currentSocketId:string){
    if(socketId&&socketId!==currentSocketId)await io.in(socketId).socketsLeave(code);
    await deps.stateStore.removePresence(code,userId,socketId);
    try{const room=await deps.game.get(code);io.to(code).emit('room:update',deps.game.publicRoom(room));}catch{/* The previous room was emptied during reconnection. */}
  }

  async function chooseWord(code: string, drawerId: string, wordId: string, socketId?: string) {
    const choiceTimeout = choiceTimeouts.get(code); if (choiceTimeout) clearTimeout(choiceTimeout);
    choiceTimeouts.delete(code);
    const { room, word } = await deps.game.chooseWord(code, drawerId, wordId, socketId);
    io.to(room.code).emit('game:round-start', { round: room.round, turnId: room.turnId, drawerUserId: room.drawerUserId, deadline: room.deadline, wordLength: word.length });
    io.to(room.players.get(drawerId)?.lastSocketId ?? '').emit('game:your-word', { word });
    io.to(room.code).emit('room:update', deps.game.publicRoom(room));
    scheduleRound(room.code, room.deadline);
  }

  function scheduleRound(code: string, deadline: number) {
    clearTimers(code);
    const tick = setInterval(() => {
      const remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      io.to(code).emit('game:timer', { remainingSeconds, deadline });
    }, 1000);
    tick.unref(); roundTicks.set(code, tick);
    const timeout = setTimeout(() => { void finishRound(code); }, Math.max(0, deadline - Date.now()));
    timeout.unref(); roundTimeouts.set(code, timeout);
  }

  async function finishRound(code: string, revealedWord?: string) {
    clearTimers(code);
    try {
      const word = revealedWord ?? await deps.game.getRoundAnswer(code) ?? '';
      await deps.game.endRound(code);
      const state = await deps.game.get(code);
      if (state.status === 'finished') {
        void persistCompletedMatch(state);
      }
      const ended = await deps.game.claimRoundEnd(code);
      if (!ended) return;
      io.to(code).emit('game:round-end', { round: ended.round, turnId: ended.turnId, word, scores: [...ended.players.values()].map((p) => ({ userId: p.userId, score: p.score })) });
      io.to(code).emit('room:update', deps.game.publicRoom(ended));
      if (ended.status === 'finished') {
        const standings = [...ended.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
        io.to(code).emit('game:match-end', { roomCode: code, standings: standings.map((p, index) => ({ place: index + 1, userId: p.userId, username: p.username, avatarId: p.avatarId, score: p.score })) });
      } else {
        const timeout = setTimeout(async () => {
          try {
            const next = await deps.game.nextRound(code, ended.hostUserId);
            await offerWords(code, next.drawer.userId);
            io.to(code).emit('room:update', deps.game.publicRoom(next.room));
          } catch (error) { respondError(undefined, error); }
        }, Math.max(0,ended.transitionAt-Date.now()));
        timeout.unref(); intermissions.set(code, timeout);
      }
    } catch (error) { respondError(undefined, error); }
  }

  async function persistCompletedMatch(room: Awaited<ReturnType<GameEngine['get']>>) {
    const retry = persistenceRetries.get(room.id);
    if (persistingMatches.has(room.id) || (retry?.after || 0) > Date.now()) return;
    persistingMatches.add(room.id);
    try {
      const outcomes = await matchPersistence.persist(room);
      for (const { userId, result } of outcomes) {
        const socketId = room.players.get(userId)?.lastSocketId;
        if (socketId && !result.duplicate) io.to(socketId).emit('game:progression-earned', result);
      }
      persistenceRetries.delete(room.id);
    } catch (error) {
      const attempts = (retry?.attempts || 0) + 1;
      const nextDelay = Math.min(60_000, 2_000 * 2 ** Math.min(attempts - 1, 5));
      persistenceRetries.set(room.id, { after: Date.now() + nextDelay, attempts });
      console.error('[match-persist-failed]', error instanceof Error ? error.name : 'unknown');
    } finally { persistingMatches.delete(room.id); }
  }

  function clearTimers(code: string) {
    const timeout = roundTimeouts.get(code); if (timeout) clearTimeout(timeout);
    const interval = roundTicks.get(code); if (interval) clearInterval(interval);
    const choice = choiceTimeouts.get(code); if (choice) clearTimeout(choice);
    const intermission = intermissions.get(code); if (intermission) clearTimeout(intermission);
    roundTimeouts.delete(code); roundTicks.delete(code); choiceTimeouts.delete(code); intermissions.delete(code);
  }

  for (const room of recoveredRooms) {
    if (room.status === 'drawing') scheduleRound(room.code, room.deadline);
    else if (room.status === 'round_end' || room.status === 'finished') await finishRound(room.code, room.secretWord ?? '');
    else if (room.status === 'choosing' && room.drawerUserId) {
      if (!room.choices.length) { await offerWords(room.code, room.drawerUserId); continue; }
      io.to(room.players.get(room.drawerUserId)?.lastSocketId ?? '').emit('game:word-choices', room.choices);
      const timeout=setTimeout(()=>{void (async()=>{const current=await deps.game.get(room.code);if(current.status==='choosing'&&current.drawerUserId===room.drawerUserId&&current.choices[0])await chooseWord(room.code,room.drawerUserId!,current.choices[0].id);})().catch(()=>undefined);},15_000);
      timeout.unref();choiceTimeouts.set(room.code,timeout);
    }
  }

  const recoverySweep=setInterval(()=>{void (async()=>{
    const rooms=await deps.game.listAll();
    for(const room of rooms){
      if(room.status==='drawing'&&room.deadline<=Date.now())await finishRound(room.code);
      else if(room.status==='choosing'&&room.choiceDeadline<=Date.now()){
        if(room.choices.length)await chooseWord(room.code,room.drawerUserId!,room.choices[0].id);
        else await offerWords(room.code,room.drawerUserId!);
      } else if(room.status==='round_end'&&room.transitionAt<=Date.now()){
        const next=await deps.game.nextRound(room.code,room.hostUserId);await offerWords(room.code,next.drawer.userId);io.to(room.code).emit('room:update',deps.game.publicRoom(next.room));
      } else if(room.status==='finished') await persistCompletedMatch(room);
    }
  })().catch(error=>console.error('[room-recovery-sweep]',error instanceof Error?error.name:'unknown'));},1000);
  recoverySweep.unref();

  return {
    roomClosed(room) {
      clearTimers(room.code);
      for (const player of room.players.values()) io.to(player.lastSocketId).emit('room:closed', { code: room.code, reason: 'This room was closed by a moderator.' });
      io.in(room.code).socketsLeave(room.code);
    },
    playerKicked(code, _userId, socketId, room) {
      if (socketId) {
        io.to(socketId).emit('room:kicked', { code, reason: 'You were removed from the room by a moderator.' });
        io.in(socketId).socketsLeave(code);
      }
      if (room) io.to(room.code).emit('room:update', deps.game.publicRoom(room));
      else clearTimers(code);
    },
  };
}

function respondError(ack: Ack | undefined, error: unknown) {
  if (!ack) return;
  if (error instanceof z.ZodError) { ack({ success: false, error: 'Invalid event payload', code: 'VALIDATION_ERROR' }); return; }
  if (error instanceof GameError) { ack({ success: false, error: error.message, code: error.code }); return; }
  ack({ success: false, error: 'The action could not be completed', code: 'ACTION_FAILED' });
}
