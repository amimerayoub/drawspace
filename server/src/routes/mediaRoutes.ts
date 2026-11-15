import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { MediaRepository, MediaVariant } from '../repositories/mediaRepository';

const MAX_BYTES = 10 * 1024 * 1024;

function actorFrom(request: Parameters<typeof identityFrom>[0], role: string) {
  const identity = identityFrom(request);
  return { userId: identity.userId, username: identity.name, role };
}

export function mediaAdminRoutes(verify: JwtVerifier, roles: AdminRoleRepository, media: MediaRepository): Router {
  const router = Router();
  const permission = requirePermission(roles, 'content.media');

  router.get('/', requireAuth(verify), permission, async (_request, response, next) => {
    try { response.json({ data: await media.list() }); } catch (error) { next(error); }
  });

  router.post('/upload', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const name = z.string().trim().min(1).max(200).safeParse(request.query.name);
      const kind = z.enum(['image', 'avatar', 'document']).default('image').safeParse(request.query.kind);
      if (!name.success || !kind.success) throw new HttpError(400, 'Invalid upload metadata', 'VALIDATION_ERROR');
      const bytes = request.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) throw new HttpError(400, 'The uploaded file is empty.', 'VALIDATION_ERROR');
      if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'The file exceeds the 10 MB limit.', 'FILE_TOO_LARGE');
      const mimeType = String(request.headers['content-type'] || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
      const asset = await media.upload({ name: name.data, kind: kind.data, mimeType, bytes }, actorFrom(request, response.locals.admin.role));
      response.status(201).json({ data: asset });
    } catch (error) { next(error instanceof Error && error.message.startsWith('Media storage is not available') ? new HttpError(503, error.message, 'STORAGE_UNAVAILABLE') : error); }
  });

  router.patch('/:id', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const id = z.string().trim().min(1).max(64).safeParse(request.params.id);
      const body = z.object({ name: z.string().trim().min(1).max(200) }).strict().safeParse(request.body);
      if (!id.success || !body.success) throw new HttpError(400, 'Invalid rename request', 'VALIDATION_ERROR');
      response.json({ data: await media.rename(id.data, body.data.name, actorFrom(request, response.locals.admin.role)) });
    } catch (error) { next(error instanceof Error && error.message === 'Media asset not found.' ? new HttpError(404, error.message, 'MEDIA_NOT_FOUND') : error); }
  });

  router.delete('/:id', requireAuth(verify), permission, async (request, response, next) => {
    try {
      const id = z.string().trim().min(1).max(64).safeParse(request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid media id', 'VALIDATION_ERROR');
      await media.remove(id.data, actorFrom(request, response.locals.admin.role));
      response.json({ data: { deleted: true } });
    } catch (error) { next(error instanceof Error && error.message === 'Media asset not found.' ? new HttpError(404, error.message, 'MEDIA_NOT_FOUND') : error); }
  });

  return router;
}

export function mediaPublicRoutes(media: MediaRepository): Router {
  const router = Router();
  router.get('/api/media/:id/view', async (request, response, next) => {
    try {
      const id = z.string().trim().min(1).max(64).safeParse(request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid media id', 'VALIDATION_ERROR');
      const variantQuery = z.enum(['original', 'thumb']).optional().safeParse(request.query.variant);
      const widthQuery = z.coerce.number().int().min(16).max(4096).optional().safeParse(request.query.w);
      if (!variantQuery.success || !widthQuery.success) throw new HttpError(400, 'Invalid media variant', 'VALIDATION_ERROR');
      const variant: MediaVariant | undefined = variantQuery.data ?? widthQuery.data;
      const file = await media.view(id.data, variant);
      if (!file) throw new HttpError(404, 'Media not found.', 'MEDIA_NOT_FOUND');
      response.type(file.mimeType);
      response.setHeader('Content-Disposition', `inline; filename="${file.name.replace(/["\r\n]/g, '')}"`);
      // Media bytes never change for a given id, so optimized output is safe to cache immutably.
      response.setHeader('Cache-Control', variant === 'original' ? 'public, max-age=86400' : 'public, max-age=31536000, immutable');
      response.send(Buffer.from(file.bytes));
    } catch (error) { next(error); }
  });
  return router;
}