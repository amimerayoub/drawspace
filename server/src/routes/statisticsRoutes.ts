import { Router } from 'express';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import type { StatisticsRepository } from '../repositories/statisticsRepository';

export function statisticsRoutes(verify: JwtVerifier, statistics: StatisticsRepository): Router {
  const router = Router();
  router.get('/me', requireAuth(verify), async (request, response, next) => {
    try { response.json({ data: await statistics.get(identityFrom(request).userId) }); }
    catch (error) { next(error); }
  });
  return router;
}
