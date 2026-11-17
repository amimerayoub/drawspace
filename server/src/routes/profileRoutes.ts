import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import type { ProfileRepository } from '../repositories/profileRepository';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { HttpError } from '../middleware/errors';

const profilePatch = z.object({
  username: z.string().trim().min(3).max(32).optional(),
  displayName: z.string().trim().min(1).max(64).optional(),
  bio: z.string().trim().max(500).optional(),
  avatarId: z.string().trim().min(1).max(32).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export function profileRoutes(verify: JwtVerifier, profiles: ProfileRepository, roles: AdminRoleRepository): Router {
  const router = Router();
  router.get('/username/:username', async (request, response, next) => {
    try {
      const profile = await profiles.findUsername(request.params.username);
      if (!profile) throw new HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
      response.json({ data: { username: profile.username, displayName: profile.displayName, bio: profile.bio, avatarId: profile.avatarId } });
    } catch (error) { next(error); }
  });
  router.get('/me', requireAuth(verify), async (request, response, next) => {
    try {
      const identity = identityFrom(request);
      const profile = await profiles.ensure({ userId: identity.userId, username: identity.name, avatarId: 'av-01', accountType: identity.isGuest ? 'guest' : 'registered' });
      const adminRole = await roles.getRole(identity.userId).catch(() => null);
      response.json({ data: { ...profile, adminRole } });
    } catch (error) { next(error); }
  });
  router.patch('/me', requireAuth(verify), async (request, response, next) => {
    try {
      const input = profilePatch.safeParse(request.body);
      if (!input.success) throw new HttpError(400, 'Invalid profile fields', 'VALIDATION_ERROR');
      const profile = await profiles.update(identityFrom(request).userId, input.data);
      response.json({ data: profile });
    } catch (error) { next(error); }
  });
  return router;
}
