import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requirePermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import { Query } from '../database/appwrite';
import type { AppwriteDatabase } from '../database/appwrite';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { RowRepository } from '../repositories/rowRepository';
import { McpKeyService } from '../mcp/keyService';
import { MCP_SCOPES, isMcpScope } from '../mcp/scopes';
import { MCP_TOOL_NAMES } from '../mcp/tools';

const createSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.string().min(1).max(32)).min(1).max(MCP_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
}).strict();
const confirmSchema = z.object({ confirm: z.literal(true) }).strict();

const actorFrom = (request: Request, response: Response) => {
  const identity = identityFrom(request);
  const admin = response.locals.admin as { role: string };
  return { userId: identity.userId, username: identity.name || 'Admin', role: admin.role };
};
const param = (request: Request, key: string) => { const value = request.params[key]; return Array.isArray(value) ? value[0] : value; };
const parse = <T>(schema: z.ZodType<T>, body: unknown, label: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  return result.data;
};

export function mcpAdminApiV1Routes(verify: JwtVerifier, roles: AdminRoleRepository, keys: McpKeyService, database: AppwriteDatabase): Router {
  const router = Router();
  router.use(requireAuth(verify), requirePermission(roles, 'settings.manage'));
  const audit = new RowRepository(database, 'audit_logs');

  router.get('/status', async (_request, response, next) => {
    try {
      const status = await keys.status();
      response.json({ data: { ...status, tools: MCP_TOOL_NAMES } });
    } catch (error) { next(error); }
  });

  router.get('/keys', async (_request, response, next) => {
    try { response.json({ data: await keys.list() }); } catch (error) { next(error); }
  });

  router.post('/keys', async (request, response, next) => {
    try {
      const input = parse(createSchema, request.body, 'MCP key');
      const invalid = input.scopes.filter((scope) => !isMcpScope(scope));
      if (invalid.length > 0) throw new HttpError(400, `Unknown scope(s): ${invalid.join(', ')}.`, 'VALIDATION_ERROR');
      const created = await keys.create(input, actorFrom(request, response));
      response.status(201).json({ data: created.view, key: created.key, message: 'Store this key now. It is shown only once and cannot be retrieved later.' });
    } catch (error) { next(error); }
  });

  router.post('/keys/:id/revoke', async (request, response, next) => {
    try {
      parse(confirmSchema, request.body, 'confirmation');
      response.json({ data: await keys.revoke(param(request, 'id'), actorFrom(request, response)) });
    } catch (error) { next(error); }
  });

  router.post('/keys/:id/rotate', async (request, response, next) => {
    try {
      parse(confirmSchema, request.body, 'confirmation');
      const rotated = await keys.rotate(param(request, 'id'), actorFrom(request, response));
      response.json({ data: rotated.view, key: rotated.key, revokedId: rotated.revokedId, message: 'Store the new key now. The previous key has been revoked.' });
    } catch (error) { next(error); }
  });

  router.get('/audit', async (request, response, next) => {
    try {
      const raw = request.query.limit;
      const limit = typeof raw === 'string' && Number.isInteger(Number(raw)) ? Math.min(Math.max(Number(raw), 1), 200) : 100;
      const [toolEvents, keyEvents] = await Promise.all([
        audit.list([Query.equal('actorRole', 'mcp'), Query.limit(limit)]).catch(() => []),
        audit.list([Query.equal('resourceType', 'mcp_key'), Query.limit(limit)]).catch(() => []),
      ]);
      const merged = [...toolEvents, ...keyEvents]
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .slice(0, limit)
        .map((row) => ({
          id: row.$id, action: String(row.action ?? ''), actorUsername: String(row.actorUsername ?? ''), actorRole: String(row.actorRole ?? ''),
          resourceType: String(row.resourceType ?? ''), resourceId: String(row.resourceId ?? ''), status: String(row.status ?? ''),
          reason: String(row.reason ?? ''), createdAt: String(row.createdAt ?? ''),
        }));
      response.json({ data: merged });
    } catch (error) { next(error); }
  });

  return router;
}