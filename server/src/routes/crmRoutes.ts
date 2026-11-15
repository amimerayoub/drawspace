import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { CRM_SEGMENTS, type CrmRepository } from '../repositories/crmRepository';

const campaignSchema = z.object({
  id: z.string().trim().max(64).optional(),
  segment: z.enum(CRM_SEGMENTS),
  subject: z.string().trim().min(1).max(90),
  body: z.string().trim().min(1).max(5000),
  status: z.enum(['draft', 'sent']).default('draft'),
}).strict();

function actorFrom(request: Parameters<typeof identityFrom>[0], role: string) {
  const identity = identityFrom(request);
  return { userId: identity.userId, username: identity.name, role };
}

export function crmAdminRoutes(verify: JwtVerifier, roles: AdminRoleRepository, crm: CrmRepository): Router {
  const router = Router();
  const permission = requirePermission(roles, 'crm.send');

  router.get('/', requireAuth(verify), permission, async (_request, response, next) => {
    try {
      const [messages, segments] = await Promise.all([crm.list(), crm.segments()]);
      response.json({ data: { messages, segments } });
    } catch (error) { next(error); }
  });
  router.put('/', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const parsed = campaignSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid campaign', 'VALIDATION_ERROR');
      response.json({ data: await crm.save(parsed.data, actorFrom(request, response.locals.admin.role)) });
    } catch (error) { next(error); }
  });
  router.post('/:id/send', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const id = z.string().trim().min(1).max(64).safeParse(request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid campaign id', 'VALIDATION_ERROR');
      response.json({ data: await crm.send(id.data, actorFrom(request, response.locals.admin.role)) });
    } catch (error) { next(error instanceof Error && error.message === 'Campaign not found.' ? new HttpError(404, error.message, 'CAMPAIGN_NOT_FOUND') : error); }
  });
  router.delete('/:id', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const id = z.string().trim().min(1).max(64).safeParse(request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid campaign id', 'VALIDATION_ERROR');
      await crm.remove(id.data, actorFrom(request, response.locals.admin.role));
      response.json({ data: { deleted: true } });
    } catch (error) { next(error instanceof Error && error.message === 'Campaign not found.' ? new HttpError(404, error.message, 'CAMPAIGN_NOT_FOUND') : error); }
  });

  return router;
}