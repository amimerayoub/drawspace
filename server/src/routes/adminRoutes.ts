import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requireAdmin, requirePermission } from '../middleware/authorize';
import { ALL_PERMISSIONS, ASSIGNABLE_ROLES, PERMISSIONS, ROLE_LABELS, permissionsForRole } from '../auth/permissions';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { ModerationReportRepository } from '../repositories/moderationReportRepository';
import { HttpError } from '../middleware/errors';
import type { AdminUserRepository, AccountStatus } from '../repositories/adminUserRepository';

export function adminRoutes(verify: JwtVerifier, roles: AdminRoleRepository, reports: ModerationReportRepository, users: AdminUserRepository): Router {
  const router = Router();
  router.get('/me', requireAuth(verify), requireAdmin(roles), (_request, response) => {
    response.json({ data: response.locals.admin });
  });
  router.get('/permissions', requireAuth(verify), requirePermission(roles, 'roles.manage'), (_request, response) => {
    response.json({ data: {
      permissions: PERMISSIONS,
      assignableRoles: ASSIGNABLE_ROLES,
      roles: ASSIGNABLE_ROLES.map((role) => ({ role, label: ROLE_LABELS[role], permissions: permissionsForRole(role) })),
      totalPermissions: ALL_PERMISSIONS.length,
    } });
  });
  const moderation = requirePermission(roles, 'moderation.handle');
  router.get('/reports', requireAuth(verify), moderation, async (request, response, next) => {
    try {
      const status = z.enum(['open', 'pending', 'resolved', 'dismissed']).optional().safeParse(request.query.status);
      if (!status.success) throw new HttpError(400, 'Invalid report status', 'VALIDATION_ERROR');
      response.json({ data: await reports.list(status.data === 'open' ? 'pending' : status.data) });
    } catch (error) { next(error); }
  });
  router.patch('/reports/:id', requireAuth(verify), moderation, async (request, response, next) => {
    try {
      const params = z.string().min(1).max(64).safeParse(request.params.id);
      const body = z.object({ status: z.enum(['resolved', 'dismissed']), reason: z.string().trim().min(3).max(255) }).strict().safeParse(request.body);
      if (!params.success || !body.success) throw new HttpError(400, 'Invalid moderation decision', 'VALIDATION_ERROR');
      const identity = identityFrom(request);
      response.json({ data: await reports.resolve(params.data, body.data.status, { userId: identity.userId, username: identity.name, role: response.locals.admin.role }, body.data.reason) });
    } catch (error) {
      if (error instanceof Error && error.message === 'Report not found.') next(new HttpError(404, error.message, 'REPORT_NOT_FOUND'));
      else if (error instanceof Error && error.message === 'This report has already been reviewed.') next(new HttpError(409, error.message, 'REPORT_ALREADY_REVIEWED'));
      else next(error);
    }
  });
  router.get('/users', requireAuth(verify), requirePermission(roles, 'users.view'), async (request, response, next) => {
    try {
      const query = z.object({ search: z.string().trim().max(128).optional(), status: z.enum(['active', 'suspended', 'banned']).optional(), role: z.enum(['guest', 'player', 'support', 'moderator', 'content_manager', 'analyst', 'admin', 'superadmin']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(10000).default(0) }).strict().safeParse(request.query);
      if (!query.success) throw new HttpError(400, 'Invalid user query', 'VALIDATION_ERROR');
      response.json({ data: await users.list(query.data) });
    } catch (error) { next(error); }
  });
  router.get('/users/:id', requireAuth(verify), requirePermission(roles, 'users.view'), async (request, response, next) => {
    try {
      const id = z.string().min(1).max(36).safeParse(Array.isArray(request.params.id) ? request.params.id[0] : request.params.id);
      if (!id.success) throw new HttpError(400, 'Invalid user ID', 'VALIDATION_ERROR');
      response.json({ data: await users.get(id.data) });
    } catch (error) { next(error); }
  });
  router.patch('/users/:id', requireAuth(verify), requireAdmin(roles, ['admin', 'superadmin']), async (request, response, next) => {
    try {
      const id = z.string().min(1).max(36).safeParse(Array.isArray(request.params.id) ? request.params.id[0] : request.params.id);
      const body = z.object({ username: z.string().trim().min(3).max(32).optional(), bio: z.string().max(140).optional(), avatarId: z.string().min(1).max(32).optional() }).strict().refine((value) => Object.keys(value).length > 0).safeParse(request.body);
      if (!id.success || !body.success) throw new HttpError(400, 'Invalid user profile update', 'VALIDATION_ERROR');
      const identity = identityFrom(request);
      response.json({ data: await users.updateProfile(id.data, body.data, { userId: identity.userId, username: identity.name, role: response.locals.admin.role }) });
    } catch (error) { next(error); }
  });
  router.patch('/users/:id/status', requireAuth(verify), requirePermission(roles, 'moderation.handle'), async (request, response, next) => {
    try {
      const id = z.string().min(1).max(36).safeParse(Array.isArray(request.params.id) ? request.params.id[0] : request.params.id);
      const body = z.object({ status: z.enum(['active', 'suspended', 'banned']), reason: z.string().trim().min(3).max(255) }).strict().safeParse(request.body);
      if (!id.success || !body.success) throw new HttpError(400, 'Invalid account status update', 'VALIDATION_ERROR');
      const identity = identityFrom(request);
      response.json({ data: await users.setStatus(id.data, body.data.status as AccountStatus, body.data.reason, { userId: identity.userId, username: identity.name, role: response.locals.admin.role }) });
    } catch (error) {
      if (error instanceof Error && error.message === 'You cannot change your own account status.') next(new HttpError(400, error.message, 'SELF_ACTION_DENIED'));
      else if (error instanceof Error && error.message.includes('Only a superadmin')) next(new HttpError(403, error.message, 'FORBIDDEN'));
      else next(error);
    }
  });
  router.patch('/users/:id/role', requireAuth(verify), requireAdmin(roles, ['superadmin']), async (request, response, next) => {
    try {
      const id = z.string().min(1).max(36).safeParse(Array.isArray(request.params.id) ? request.params.id[0] : request.params.id);
      const body = z.object({ role: z.enum(['superadmin', 'admin', 'moderator', 'content_manager', 'analyst', 'support']).nullable(), reason: z.string().trim().min(3).max(255) }).strict().safeParse(request.body);
      if (!id.success || !body.success) throw new HttpError(400, 'Invalid role assignment', 'VALIDATION_ERROR');
      const identity = identityFrom(request);
      response.json({ data: await users.assignRole(id.data, body.data.role, { userId: identity.userId, username: identity.name, role: response.locals.admin.role }) });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('cannot change your own') || error.message.includes('last active superadmin'))) next(new HttpError(409, error.message, 'ROLE_CHANGE_CONFLICT'));
      else next(error);
    }
  });
  return router;
}
