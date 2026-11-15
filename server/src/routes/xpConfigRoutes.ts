import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { XpConfigRepository } from '../repositories/xpConfigRepository';

const xpSchema = z.object({
  correctGuessXp: z.number().int().min(0).max(200),
  winBonusXp: z.number().int().min(0).max(500),
  challengeMultiplier: z.number().min(0.5).max(5),
  levelBase: z.number().int().min(10).max(5000),
  levelGrowth: z.number().min(1).max(2),
}).strict();

const actorFrom = (request: Request, response: Response) => {
  const identity = identityFrom(request);
  const admin = response.locals.admin as { role: string };
  return { userId: identity.userId, username: identity.name || 'Admin', role: admin.role };
};

export function xpConfigRoutes(verify: JwtVerifier, roles: AdminRoleRepository, xp: XpConfigRepository): Router {
  const router = Router();
  const access = requirePermission(roles, 'config.xp');
  router.get('/', requireAuth(verify), access, async (_request, response, next) => {
    try { response.json({ data: await xp.get() }); } catch (error) { next(error); }
  });
  router.put('/', requireAuth(verify), access, async (request, response, next) => {
    try {
      const parsed = xpSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid XP configuration.', 'VALIDATION_ERROR');
      response.json({ data: await xp.update(parsed.data, actorFrom(request, response)) });
    } catch (error) { next(error); }
  });
  return router;
}