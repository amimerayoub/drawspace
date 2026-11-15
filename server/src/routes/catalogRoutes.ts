import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { hasPermission, type Permission } from '../auth/permissions';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { CATALOGS, type CatalogKind, type CatalogRepository } from '../repositories/catalogRepository';

const CATALOG_PERMISSION: Record<CatalogKind, Permission> = {
  avatars: 'content.media',
  titles: 'rewards.manage',
  achievements: 'rewards.manage',
  challenges: 'challenges.manage',
  words: 'words.manage',
};

export const catalogInputSchemas: Record<CatalogKind, z.ZodType<Record<string, unknown>>> = {
  avatars: z.object({ name: z.string().trim().min(1).max(64), category: z.string().max(32), assetPath: z.string().max(255), isActive: z.boolean(), sortOrder: z.number().int().min(0).max(1000) }).strict(),
  titles: z.object({ name: z.string().trim().min(1).max(64), description: z.string().max(255), rarity: z.string().min(1).max(32), isActive: z.boolean(), iconAsset: z.string().max(128), sortOrder: z.number().int().min(0).max(1000), unlockCondition: z.string().max(255) }).strict(),
  achievements: z.object({ name: z.string().trim().min(1).max(64), description: z.string().max(255), category: z.string().min(1).max(32), conditionValue: z.number().int().min(1).max(100000), iconAsset: z.string().max(128), isActive: z.boolean(), rewardXP: z.number().int().min(0).max(100000), sortOrder: z.number().int().min(0).max(1000), conditionType: z.string().min(1).max(32), rarity: z.string().min(1).max(32) }).strict(),
  challenges: z.object({ name: z.string().trim().min(1).max(64), description: z.string().max(255), period: z.string().min(1).max(32), targetValue: z.number().int().min(1).max(100000), rewardXP: z.number().int().min(0).max(100000), isActive: z.boolean(), endsAt: z.string().min(1).max(64), type: z.string().min(1).max(32), startsAt: z.string().min(1).max(64) }).strict(),
  words: z.object({ word: z.string().trim().min(2).max(64), category: z.string().trim().min(1).max(32), difficulty: z.enum(['easy', 'medium', 'hard']), isActive: z.boolean() }).strict(),
};
const actorFor = (request: Request, response: Response) => { const identity = identityFrom(request); return { userId: identity.userId, username: identity.name || 'Admin', role: (response.locals.admin as { role: string }).role }; };
export function catalogRoutes(verify: JwtVerifier, roles: AdminRoleRepository, catalog: CatalogRepository) {
  const router = Router(); const auth = requireAuth(verify);
  const admin: RequestHandler = async (req, res, next) => {
    try {
      const identity = identityFrom(req);
      const role = await roles.getRole(identity.userId);
      if (!role) { res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }); return; }
      res.locals.admin = { userId: identity.userId, role };
      const permission = CATALOG_PERMISSION[String(req.params.kind) as CatalogKind];
      if (permission && !hasPermission(role, permission)) { res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }); return; }
      next();
    } catch (e) { next(e); }
  };
  const kindOf = (value: string): CatalogKind | null => Object.prototype.hasOwnProperty.call(CATALOGS, value) ? value as CatalogKind : null;
  router.get('/:kind', auth, admin, async (req, res, next) => { try { const kind = kindOf(String(req.params.kind)); if (!kind) throw new HttpError(404, 'Catalog not found', 'NOT_FOUND'); const q = z.string().trim().max(100).optional().safeParse(req.query.search); if (!q.success) throw new HttpError(400, 'Invalid search', 'VALIDATION_ERROR'); res.json({ data: await catalog.list(kind, q.data) }); } catch (e) { next(e); } });
  router.put('/:kind/:id', auth, admin, async (req, res, next) => { try { const kind = kindOf(String(req.params.kind)); if (!kind) throw new HttpError(404, 'Catalog not found', 'NOT_FOUND'); const id = z.string().trim().min(1).max(kind === 'words' ? 64 : 36).safeParse(req.params.id); const input = catalogInputSchemas[kind].safeParse(req.body); if (!id.success || !input.success) throw new HttpError(400, 'Invalid catalog item', 'VALIDATION_ERROR'); res.json({ data: await catalog.save(kind, id.data, input.data, actorFor(req, res)) }); } catch (e) { if (e instanceof Error && (e.message.includes('already exists'))) next(new HttpError(409, e.message, 'DUPLICATE')); else next(e); } });
  router.delete('/:kind/:id', auth, admin, async (req, res, next) => { try { const kind = kindOf(String(req.params.kind)); if (!kind) throw new HttpError(404, 'Catalog not found', 'NOT_FOUND'); const id = z.string().min(1).max(64).safeParse(req.params.id); if (!id.success) throw new HttpError(400, 'Invalid catalog ID', 'VALIDATION_ERROR'); res.json({ data: await catalog.delete(kind, id.data, actorFor(req, res)) }); } catch (e) { if (e instanceof Error && e.message === 'Catalog item not found.') next(new HttpError(404, e.message, 'NOT_FOUND')); else if (e instanceof Error && e.message.includes('referenced')) next(new HttpError(409, e.message, 'ITEM_REFERENCED')); else next(e); } });
  return router;
}
