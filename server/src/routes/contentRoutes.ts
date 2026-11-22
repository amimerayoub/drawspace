import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { HttpError } from '../middleware/errors';
import { requirePermission } from '../middleware/authorize';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { AdminDataRepository } from '../repositories/adminDataRepository';

const wordSchema = z.object({ id: z.string().min(1).max(64), text: z.string().trim().min(2).max(32), difficulty: z.enum(['easy', 'medium', 'hard']), category: z.string().trim().min(1).max(32), active: z.boolean() }).strict();
const postSchema = z.object({ id: z.string().min(1).max(64), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64), title: z.string().trim().min(1).max(255), excerpt: z.string().max(500), body: z.array(z.string().max(50000)).min(1).max(100).refine((body) => body.join('\n\n').length <= 50000, 'Article body exceeds the database limit'), category: z.string().trim().min(1).max(64), status: z.enum(['draft', 'published', 'scheduled']), cover: z.string().max(255), seoTitle: z.string().max(128), seoDescription: z.string().max(255), publishAt: z.string().max(64) }).strict();
const adSchema = z.object({ id: z.string().min(1).max(64), name: z.string().trim().min(1).max(64), placement: z.enum(['landing', 'blog']), enabled: z.boolean(), startDate: z.string().max(64), endDate: z.string().max(64), priority: z.number().int().min(0).max(1000), body: z.string().max(255) }).strict();
const settingsSchema = z.object({ siteName: z.string().trim().min(1).max(64), tagline: z.string().max(255), contactEmail: z.string().email().max(128), defaultLocale: z.string().max(16), maintenance: z.boolean(), registrationOpen: z.boolean(), guestPlay: z.boolean(), gaMeasurementId: z.string().trim().max(32).regex(/^(G-[A-Z0-9]{4,20})?$/i, 'Invalid GA4 measurement ID').default(''), gtmContainerId: z.string().trim().max(32).regex(/^(GTM-[A-Z0-9]{4,20})?$/i, 'Invalid GTM container ID').default('') }).strict();
const actorFrom = (request: Request, response: Response) => { const identity = identityFrom(request); const admin = response.locals.admin as { role: string }; return { userId: identity.userId, username: identity.name || 'Admin', role: admin.role }; };
const paramId = (request: Request) => { const value = request.params.id; return Array.isArray(value) ? value[0] : value; };

export function contentRoutes(verify: JwtVerifier, roles: AdminRoleRepository, data: AdminDataRepository): Router {
  const router = Router();
  const admin = requireAuth(verify);
  const wordAccess = requirePermission(roles, 'words.manage');
  const blogAccess = requirePermission(roles, 'content.blog');
  const adAccess = requirePermission(roles, 'content.ads');
  const settingsAccess = requirePermission(roles, 'settings.manage');
  const auditAccess = requirePermission(roles, 'audit.view');
  router.get('/words', admin, wordAccess, async (_req, res, next) => { try { res.json({ data: await data.listWords() }); } catch (e) { next(e); } });
  router.put('/words/:id', admin, wordAccess, async (req, res, next) => {
    try { const input = wordSchema.safeParse({ ...req.body, id: paramId(req) }); if (!input.success) throw new HttpError(400, 'Invalid word', 'VALIDATION_ERROR'); res.json({ data: await data.saveWord(input.data, actorFrom(req, res)) }); }
    catch (e) { next(e); }
  });
  router.delete('/words/:id', admin, wordAccess, async (req, res, next) => { try { await data.deleteWord(paramId(req), actorFrom(req, res)); res.json({ data: { deleted: true } }); } catch (e) { next(e instanceof Error && e.message === 'Word not found.' ? new HttpError(404, e.message, 'WORD_NOT_FOUND') : e); } });
  router.get('/blog', admin, blogAccess, async (_req, res, next) => { try { res.json({ data: await data.listPosts(true) }); } catch (e) { next(e); } });
  router.put('/blog/:id', admin, blogAccess, async (req, res, next) => {
    try { const input = postSchema.safeParse({ ...req.body, id: paramId(req) }); if (!input.success) throw new HttpError(400, 'Invalid blog post', 'VALIDATION_ERROR'); res.json({ data: await data.savePost({ ...input.data, content: input.data.body.join('\n\n') }, actorFrom(req, res)) }); }
    catch (e) { next(e); }
  });
  router.delete('/blog/:id', admin, blogAccess, async (req, res, next) => { try { await data.deletePost(paramId(req), actorFrom(req, res)); res.json({ data: { deleted: true } }); } catch (e) { next(e instanceof Error && e.message === 'Blog post not found.' ? new HttpError(404, e.message, 'POST_NOT_FOUND') : e); } });
  router.get('/ads', admin, adAccess, async (_req, res, next) => { try { res.json({ data: await data.listAds() }); } catch (e) { next(e); } });
  router.put('/ads/:id', admin, adAccess, async (req, res, next) => { try { const input = adSchema.safeParse({ ...req.body, id: paramId(req) }); if (!input.success) throw new HttpError(400, 'Invalid advertisement', 'VALIDATION_ERROR'); await data.saveAd(input.data, actorFrom(req, res)); res.json({ data: input.data }); } catch (e) { next(e); } });
  router.delete('/ads/:id', admin, adAccess, async (req, res, next) => { try { await data.deleteAd(paramId(req), actorFrom(req, res)); res.json({ data: { deleted: true } }); } catch (e) { next(e instanceof Error && e.message === 'Advertisement not found.' ? new HttpError(404, e.message, 'AD_NOT_FOUND') : e); } });
  router.get('/settings', admin, settingsAccess, async (_req, res, next) => { try { res.json({ data: await data.getSettings() }); } catch (e) { next(e); } });
  router.put('/settings', admin, settingsAccess, async (req, res, next) => { try { const input = settingsSchema.safeParse(req.body); if (!input.success) throw new HttpError(400, 'Invalid platform settings', 'VALIDATION_ERROR'); res.json({ data: await data.updateSettings(input.data, actorFrom(req, res)) }); } catch (e) { next(e); } });
  router.get('/audit', admin, auditAccess, async (_req, res, next) => { try { res.json({ data: await data.listAudit() }); } catch (e) { next(e); } });
  return router;
}

export function publicAdRoutes(data: AdminDataRepository): Router {
  const router = Router();
  router.get('/:placement', async (req, res, next) => {
    try { const placement = z.enum(['landing', 'blog']).safeParse(Array.isArray(req.params.placement) ? req.params.placement[0] : req.params.placement); if (!placement.success) throw new HttpError(400, 'Invalid ad placement', 'VALIDATION_ERROR'); res.json({ data: await data.activeAd(placement.data) }); }
    catch (error) { next(error); }
  });
  return router;
}

export function publicConfigRoutes(data: AdminDataRepository): Router {
  const router = Router();
  router.get('/', async (_req, res, next) => { try { res.json({ data: await data.getPublicConfig() }); } catch (e) { next(e); } });
  return router;
}
