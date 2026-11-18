import { Router } from 'express';
import type { JwtVerifier } from '../auth/verifyJwt';
import { requireAuth } from '../auth/middleware';
import { requireAdmin } from '../middleware/authorize';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { appwriteStatsSnapshot } from '../monitoring/appwriteStats';

export function appwriteStatsRoutes(verify: JwtVerifier, roles: AdminRoleRepository): Router {
  const router = Router();
  router.get('/', requireAuth(verify), requireAdmin(roles), (_request, response) => {
    response.json({ data: appwriteStatsSnapshot() });
  });
  return router;
}