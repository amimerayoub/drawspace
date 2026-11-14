import type { RequestHandler } from 'express';
import type { AdminRole, AdminRoleRepository } from '../repositories/adminRoleRepository';
import { identityFrom } from '../auth/middleware';

export function requireAdmin(roles: AdminRoleRepository, allowed?: AdminRole[]): RequestHandler {
  return async (request, response, next) => {
    try {
      const identity = identityFrom(request);
      const role = await roles.getRole(identity.userId);
      if (!role || (allowed && !allowed.includes(role))) {
        response.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
        return;
      }
      response.locals.admin = { userId: identity.userId, role };
      next();
    } catch (error) { next(error); }
  };
}
