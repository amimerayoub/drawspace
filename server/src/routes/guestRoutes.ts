import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import type { GuestRepository } from '../repositories/guestRepository';
import type { ProfileRepository } from '../repositories/profileRepository';
import { HttpError } from '../middleware/errors';

const createSchema = z.object({ username: z.string().trim().min(3).max(32), avatarId: z.string().trim().min(1).max(32) }).strict();

export function guestRoutes(verify: JwtVerifier, guests: GuestRepository, profiles: ProfileRepository): Router {
  const router = Router();
  router.post('/session', requireAuth(verify), async (request, response, next) => {
    try {
      const identity = identityFrom(request);
      if (!identity.isGuest) throw new HttpError(403, 'Guest identity required', 'GUEST_ONLY');
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid guest profile', 'VALIDATION_ERROR');
      await guests.ensure(identity.userId, parsed.data.username, parsed.data.avatarId);
      let profile;
      try {
        profile = await profiles.ensure({ userId: identity.userId, username: parsed.data.username, avatarId: parsed.data.avatarId, accountType: 'guest' });
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 409) {
          throw new HttpError(409, 'That name is already taken. Try another.', 'USERNAME_TAKEN');
        }
        throw error;
      }
      response.status(201).json({ data: profile });
    } catch (error) { next(error); }
  });
  router.post('/migrate', requireAuth(verify), async (request, response, next) => {
    try {
      const identity = identityFrom(request);
      if (identity.isGuest) throw new HttpError(403, 'Convert the Appwrite account before migrating guest progress', 'ACCOUNT_STILL_GUEST');
      const migrated = await guests.migrateSameAccount(identity.userId);
      if (!migrated) throw new HttpError(404, 'No active guest session for this account', 'GUEST_SESSION_NOT_FOUND');
      await profiles.markRegistered(identity.userId);
      response.json({ data: { migrated: true, userId: identity.userId } });
    } catch (error) { next(error); }
  });
  return router;
}
