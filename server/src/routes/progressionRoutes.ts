import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, optionalAuth, requireAuth, type AuthenticatedRequest } from '../auth/middleware';
import { HttpError } from '../middleware/errors';
import type { ProgressionRepository } from '../repositories/progressionRepository';

export function progressionRoutes(verify: JwtVerifier, progression: ProgressionRepository): Router {
  const router = Router();
  router.get('/me', requireAuth(verify), async (request, response, next) => {
    try { response.json({ data: await progression.dashboard(identityFrom(request).userId) }); }
    catch (error) { next(error); }
  });
  router.get('/leaderboard', optionalAuth(verify), async (request, response, next) => {
    try {
      const period = z.enum(['all-time', 'weekly', 'monthly']).safeParse(request.query.period ?? 'all-time');
      if (!period.success) throw new HttpError(400, 'Invalid leaderboard period', 'VALIDATION_ERROR');
      const identity = (request as AuthenticatedRequest).identity;
      const entries = await progression.leaderboard(period.data);
      response.json({ data: entries.map(({ userId, ...entry }) => ({ ...entry, isMe: identity?.userId === userId })) });
    } catch (error) { next(error); }
  });
  router.get('/achievements', async (_request, response, next) => {
    try { response.json({ data: await progression.publicAchievements() }); }
    catch (error) { next(error); }
  });
  router.post('/titles/equip', requireAuth(verify), async (request, response, next) => {
    try {
      const body = z.object({ titleId: z.string().min(1).max(64).nullable() }).strict().safeParse(request.body);
      if (!body.success) throw new HttpError(400, 'Invalid title selection', 'VALIDATION_ERROR');
      response.json({ data: await progression.equipTitle(identityFrom(request).userId, body.data.titleId) });
    } catch (error) { next(error instanceof Error && !(error instanceof HttpError) ? new HttpError(400, error.message, 'TITLE_NOT_AVAILABLE') : error); }
  });
  router.post('/challenges/:id/claim', requireAuth(verify), async (request, response, next) => {
    try {
      const id = z.string().min(1).max(64).safeParse(request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid challenge', 'VALIDATION_ERROR');
      response.json({ data: await progression.claimChallenge(identityFrom(request).userId, id.data) });
    } catch (error) { next(error instanceof Error && !(error instanceof HttpError) ? new HttpError(400, error.message, 'CHALLENGE_NOT_READY') : error); }
  });
  return router;
}
