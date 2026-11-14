import { Router } from 'express';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';

export function authRoutes(verify: JwtVerifier): Router {
  const router = Router();
  router.get('/me', requireAuth(verify), (request, response) => response.json({ data: identityFrom(request) }));
  return router;
}
