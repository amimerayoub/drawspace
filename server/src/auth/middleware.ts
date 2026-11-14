import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { JwtVerifier } from './verifyJwt';
import type { AuthenticatedIdentity } from '../types/identity';

export interface AuthenticatedRequest extends Request {
  identity?: AuthenticatedIdentity;
}

export function requireAuth(verify: JwtVerifier): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const header = request.get('authorization');
    const match = header?.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      response.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }
    try {
      (request as AuthenticatedRequest).identity = await verify(match[1]);
      next();
    } catch {
      response.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
    }
  };
}

/** Preserve a public route while deriving an optional authenticated identity for safe personalization. */
export function optionalAuth(verify: JwtVerifier): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const header = request.get('authorization');
    if (!header) { next(); return; }
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) { response.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' }); return; }
    try {
      (request as AuthenticatedRequest).identity = await verify(match[1]);
      next();
    } catch {
      response.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
    }
  };
}

export function identityFrom(request: Request): AuthenticatedIdentity {
  const identity = (request as AuthenticatedRequest).identity;
  if (!identity) throw new Error('Authentication middleware is missing');
  return identity;
}
