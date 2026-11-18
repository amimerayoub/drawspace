import { Router } from 'express';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { ProfileRepository } from '../repositories/profileRepository';
import type { ProgressionRepository } from '../repositories/progressionRepository';
import type { StatisticsRepository } from '../repositories/statisticsRepository';

// One round trip for everything the SPA needs after sign-in; the three /me routes stay
// available and share the same per-user caches.
export function meRoutes(verify: JwtVerifier, profiles: ProfileRepository, statistics: StatisticsRepository, progression: ProgressionRepository, roles: AdminRoleRepository): Router {
  const router = Router();
  router.get('/bootstrap', requireAuth(verify), async (request, response, next) => {
    try {
      const identity = identityFrom(request);
      const [profile, stats, dashboard, adminRole] = await Promise.all([
        profiles.ensure({ userId: identity.userId, username: identity.name, avatarId: 'av-01', accountType: identity.isGuest ? 'guest' : 'registered' }),
        statistics.get(identity.userId),
        progression.dashboard(identity.userId),
        roles.getRole(identity.userId).catch(() => null),
      ]);
      response.json({ data: { profile: { ...profile, adminRole }, statistics: stats, progression: dashboard } });
    } catch (error) { next(error); }
  });
  return router;
}