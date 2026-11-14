import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { HttpError } from '../middleware/errors';
import type { GameEngine } from '../game/engine';
import type { ModerationReportRepository } from '../repositories/moderationReportRepository';

const schema = z.object({
  roomCode: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  reportedUserId: z.string().min(1).max(36),
  reportType: z.enum(['drawing', 'chat', 'harassment', 'cheating', 'other']),
  description: z.string().trim().min(5).max(500),
}).strict();

export function reportRoutes(verify: JwtVerifier, reports: ModerationReportRepository, game: GameEngine): Router {
  const router = Router();
  router.post('/', requireAuth(verify), async (request, response, next) => {
    try {
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid report details', 'VALIDATION_ERROR');
      const identity = identityFrom(request);
      if (identity.userId === parsed.data.reportedUserId) throw new HttpError(400, 'You cannot report yourself', 'INVALID_TARGET');
      const room = await game.get(parsed.data.roomCode);
      const reporter = game.playerFor(room, identity.userId);
      const reported = game.playerFor(room, parsed.data.reportedUserId);
      const report = await reports.create({
        reporterUserId: identity.userId,
        reporterUsername: reporter.username,
        reportedUserId: reported.userId,
        reportedUsername: reported.username,
        reportType: parsed.data.reportType,
        description: parsed.data.description,
        roomId: room.code,
      });
      response.status(201).json({ data: report });
    } catch (error) { next(error); }
  });
  return router;
}
