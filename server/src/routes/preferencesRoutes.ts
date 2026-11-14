import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import type { PreferencesRepository } from '../repositories/preferencesRepository';
import { HttpError } from '../middleware/errors';

const mapSchema = z.record(z.string(), z.boolean()).optional();
const patchSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  language: z.string().trim().min(2).max(16).optional(),
  soundEnabled: z.boolean().optional(),
  notificationPreferences: mapSchema,
  privacySettings: mapSchema,
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one preference is required');

export function preferencesRoutes(verify: JwtVerifier, preferences: PreferencesRepository): Router {
  const router = Router();
  router.get('/me', requireAuth(verify), async (request, response, next) => {
    try { response.json({ data: await preferences.get(identityFrom(request).userId) }); }
    catch (error) { next(error); }
  });
  router.patch('/me', requireAuth(verify), async (request, response, next) => {
    try {
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid preference fields', 'VALIDATION_ERROR');
      response.json({ data: await preferences.update(identityFrom(request).userId, parsed.data) });
    } catch (error) { next(error); }
  });
  return router;
}
