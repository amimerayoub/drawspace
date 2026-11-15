import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { GameError } from '../game/engine';
import type { RoomAdminService } from '../game/roomAdmin';

const codeSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const closeSchema = z.object({ confirm: z.literal(true), reason: z.string().trim().min(3).max(255) }).strict();
const kickSchema = z.object({ userId: z.string().min(1).max(64), reason: z.string().trim().min(3).max(255) }).strict();

const actorFrom = (request: Request, response: Response) => {
  const identity = identityFrom(request);
  const admin = response.locals.admin as { role: string };
  return { userId: identity.userId, username: identity.name || 'Admin', role: admin.role };
};
const codeFrom = (request: Request) => {
  const parsed = codeSchema.safeParse(Array.isArray(request.params.code) ? request.params.code[0] : request.params.code);
  if (!parsed.success) throw new HttpError(400, 'Invalid room code.', 'VALIDATION_ERROR');
  return parsed.data;
};
const parse = <T>(schema: z.ZodType<T>, body: unknown, label: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  return result.data;
};

export function roomAdminRoutes(verify: JwtVerifier, roles: AdminRoleRepository, rooms: RoomAdminService): Router {
  const router = Router();
  const auth = requireAuth(verify);
  const view = requirePermission(roles, 'rooms.view');
  const moderate = requirePermission(roles, 'moderation.handle');

  router.get('/', auth, view, async (_request, response, next) => {
    try { response.json({ data: await rooms.list() }); } catch (error) { next(error); }
  });
  router.get('/:code', auth, view, async (request, response, next) => {
    try { response.json({ data: await rooms.get(codeFrom(request)) }); } catch (error) { next(mapRoomError(error)); }
  });
  router.post('/:code/close', auth, moderate, async (request, response, next) => {
    try {
      const code = codeFrom(request);
      const input = parse(closeSchema, request.body, 'room closure');
      response.json({ data: await rooms.close(code, actorFrom(request, response), input.reason) });
    } catch (error) { next(mapRoomError(error)); }
  });
  router.post('/:code/kick', auth, moderate, async (request, response, next) => {
    try {
      const code = codeFrom(request);
      const input = parse(kickSchema, request.body, 'player removal');
      const data = await rooms.kick(code, input.userId, actorFrom(request, response), input.reason);
      response.json({ data: { room: data, removedUserId: input.userId } });
    } catch (error) { next(mapRoomError(error)); }
  });
  return router;
}

function mapRoomError(error: unknown): unknown {
  if (error instanceof GameError && (error.code === 'ROOM_NOT_FOUND' || error.code === 'NOT_IN_ROOM')) return new HttpError(404, error.message, error.code);
  return error;
}