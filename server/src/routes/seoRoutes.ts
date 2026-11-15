import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { SeoRepository } from '../repositories/seoRepository';

const seoSchema = z.object({
  route: z.string().trim().min(1).max(200).refine((value) => value.startsWith('/'), 'Route must start with /'),
  title: z.string().trim().min(1).max(70),
  description: z.string().trim().min(1).max(170),
  canonical: z.string().trim().max(300),
  ogTitle: z.string().trim().max(70),
  ogDescription: z.string().trim().max(170),
  robots: z.enum(['index', 'noindex']),
  structuredData: z.string().max(5000).refine((value) => { if (!value.trim()) return true; try { JSON.parse(value); return true; } catch { return false; } }, 'Structured data must be valid JSON'),
}).strict();

const redirectSchema = z.object({
  id: z.string().trim().max(64).optional(),
  from: z.string().trim().min(1).max(200).refine((value) => value.startsWith('/'), 'From must start with /'),
  to: z.string().trim().min(1).max(200).refine((value) => value.startsWith('/'), 'To must start with /'),
  code: z.union([z.literal(301), z.literal(302)]),
}).strict();

function actorFrom(request: Parameters<typeof identityFrom>[0], role: string) {
  const identity = identityFrom(request);
  return { userId: identity.userId, username: identity.name, role };
}

export function seoAdminRoutes(verify: JwtVerifier, roles: AdminRoleRepository, seo: SeoRepository): Router {
  const router = Router();
  const permission = requirePermission(roles, 'content.seo');

  router.get('/', requireAuth(verify), permission, async (_request, response, next) => {
    try { response.json({ data: await seo.listSeo() }); } catch (error) { next(error); }
  });
  router.put('/', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const parsed = seoSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid SEO record', 'VALIDATION_ERROR');
      response.json({ data: await seo.saveSeo(parsed.data, actorFrom(request, response.locals.admin.role)) });
    } catch (error) { next(error); }
  });
  router.delete('/', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const route = z.string().trim().min(1).max(200).safeParse(request.query.route);
      if (!route.success) throw new HttpError(400, 'Invalid route', 'VALIDATION_ERROR');
      await seo.deleteSeo(route.data, actorFrom(request, response.locals.admin.role));
      response.json({ data: { deleted: true } });
    } catch (error) { next(error instanceof Error && error.message === 'SEO record not found.' ? new HttpError(404, error.message, 'SEO_NOT_FOUND') : error); }
  });

  router.get('/redirects', requireAuth(verify), permission, async (_request, response, next) => {
    try { response.json({ data: await seo.listRedirects() }); } catch (error) { next(error); }
  });
  router.put('/redirects', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const parsed = redirectSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid redirect rule', 'VALIDATION_ERROR');
      response.json({ data: await seo.saveRedirect({ ...parsed.data, id: parsed.data.id || '', hits: 0 }, actorFrom(request, response.locals.admin.role)) });
    } catch (error) { next(error instanceof Error && error.message === 'A redirect from this path already exists.' ? new HttpError(409, error.message, 'REDIRECT_CONFLICT') : error); }
  });
  router.delete('/redirects/:id', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const id = z.string().trim().min(1).max(64).safeParse(request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid redirect id', 'VALIDATION_ERROR');
      await seo.deleteRedirect(id.data, actorFrom(request, response.locals.admin.role));
      response.json({ data: { deleted: true } });
    } catch (error) { next(error instanceof Error && error.message === 'Redirect not found.' ? new HttpError(404, error.message, 'REDIRECT_NOT_FOUND') : error); }
  });

  return router;
}

export function seoPublicRoutes(seo: SeoRepository): Router {
  const router = Router();
  const siteUrl = (request: { protocol: string; get(name: string): string | undefined }) => `${request.protocol}://${request.get('host') || 'drawspace.cloud'}`;
  router.get('/robots.txt', async (request, response, next) => {
    try { response.type('text/plain').send(await seo.robotsTxt(siteUrl(request))); } catch (error) { next(error); }
  });
  router.get('/sitemap.xml', async (request, response, next) => {
    try { response.type('application/xml').send(await seo.sitemapXml(siteUrl(request))); } catch (error) { next(error); }
  });
  router.get('/api/redirects', async (_request, response, next) => {
    try { response.json({ data: await seo.listRedirects() }); } catch (error) { next(error); }
  });
  return router;
}