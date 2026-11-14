import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requireAdmin } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { MatchHistoryRepository, MatchPlayerRecord } from '../repositories/matchHistoryRepository';
import type { ProfileRepository } from '../repositories/profileRepository';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).max(10000).default(0) }).strict();
const publicPlayer = (row: MatchPlayerRecord) => ({ matchId: row.matchId, roomName: row.roomName, completedAt: row.completedAt, durationSeconds: row.durationSeconds, username: row.username, avatarId: row.avatarId, score: row.score, placement: row.placement, isWinner: row.isWinner, playerCount: row.playerCount, roundsCompleted: row.roundsCompleted });
const publicMatch = (rows: MatchPlayerRecord[]) => ({ matchId: rows[0].matchId, roomName: rows[0].roomName, completedAt: rows[0].completedAt, durationSeconds: rows[0].durationSeconds, configuration: JSON.parse(rows[0].configuration), players: rows.map((row) => ({ username: row.username, avatarId: row.avatarId, score: row.score, placement: row.placement, isWinner: row.isWinner })) });

export function matchRoutes(verify: JwtVerifier, history: MatchHistoryRepository, profiles: ProfileRepository, roles: AdminRoleRepository): Router {
  const router = Router();
  router.get('/me', requireAuth(verify), async (req, res, next) => {
    try { const query = querySchema.safeParse(req.query); if (!query.success) throw new HttpError(400, 'Invalid match history pagination.', 'VALIDATION_ERROR'); const result = await history.listForUser(identityFrom(req).userId, query.data.limit, query.data.offset); res.json({ data: result.rows.map(publicPlayer), pagination: { total: result.total, limit: query.data.limit, offset: query.data.offset } }); }
    catch (error) { next(error); }
  });
  router.get('/player/:username', async (req, res, next) => {
    try { const username = z.string().trim().min(3).max(32).safeParse(req.params.username); const query = querySchema.safeParse(req.query); if (!username.success || !query.success) throw new HttpError(400, 'Invalid player history query.', 'VALIDATION_ERROR'); const profile = await profiles.findUsername(username.data); if (!profile) throw new HttpError(404, 'Player not found.', 'PROFILE_NOT_FOUND'); const result = await history.listForPlayer(profile.userId, query.data.limit, query.data.offset); res.json({ data: result.rows.map(publicPlayer), pagination: { total: result.total, limit: query.data.limit, offset: query.data.offset } }); }
    catch (error) { next(error); }
  });
  router.get('/admin', requireAuth(verify), requireAdmin(roles, ['admin', 'superadmin']), async (req, res, next) => {
    try { const query = querySchema.safeParse(req.query); if (!query.success) throw new HttpError(400, 'Invalid match query.', 'VALIDATION_ERROR'); const result = await history.listAll(query.data.limit, query.data.offset); const matches = await Promise.all([...new Set(result.rows.map((row) => row.matchId))].map(async (id) => history.getMatch(id))); res.json({ data: matches.filter((rows) => rows.length).map(publicMatch), pagination: { total: result.total, limit: query.data.limit, offset: query.data.offset } }); }
    catch (error) { next(error); }
  });
  router.get('/:matchId', async (req, res, next) => {
    try { const id = z.string().min(1).max(64).safeParse(req.params.matchId); if (!id.success) throw new HttpError(400, 'Invalid match ID.', 'VALIDATION_ERROR'); const rows = await history.getMatch(id.data); if (!rows.length) throw new HttpError(404, 'Match not found.', 'MATCH_NOT_FOUND'); res.json({ data: publicMatch(rows) }); }
    catch (error) { next(error); }
  });
  return router;
}
