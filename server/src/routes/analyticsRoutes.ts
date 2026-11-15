import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { AnalyticsRepository } from '../repositories/analyticsRepository';

export function analyticsRoutes(verify: JwtVerifier, roles: AdminRoleRepository, analytics: AnalyticsRepository): Router {
  const router = Router();
  router.get('/', requireAuth(verify), requirePermission(roles, 'analytics.view'), async (request, response, next) => {
    try {
      const days = z.coerce.number().int().min(7).max(90).default(14).safeParse(request.query.days);
      if (!days.success) throw new HttpError(400, 'Invalid analytics range', 'VALIDATION_ERROR');
      response.json({ data: await analytics.get(days.data) });
    } catch (error) { next(error); }
  });
  return router;
}