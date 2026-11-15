import { Router } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { HttpError } from '../middleware/errors';
import { requirePermission } from '../middleware/authorize';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { GameSettingsRepository } from '../repositories/gameSettingsRepository';
export const gameSettingsSchema=z.object({maxPlayers:z.number().int().min(2).max(32),guessRateLimitPerMinute:z.number().int().min(5).max(300),chatRateLimitPerMinute:z.number().int().min(5).max(300),allowCustomWords:z.boolean()}).strict();
export function gameSettingsRoutes(verify:JwtVerifier,roles:AdminRoleRepository,repo:GameSettingsRepository){const r=Router();const auth=requireAuth(verify);const access=requirePermission(roles,'config.game');r.get('/',auth,access,async(_q,s,n)=>{try{s.json({data:await repo.get()});}catch(e){n(e);}});r.put('/',auth,access,async(q,s,n)=>{try{const parsed=gameSettingsSchema.safeParse(q.body);if(!parsed.success)throw new HttpError(400,'Invalid game settings','VALIDATION_ERROR');const i=identityFrom(q);s.json({data:await repo.update(parsed.data,{userId:i.userId,username:i.name||'Admin',role:s.locals.admin.role})});}catch(e){n(e);}});return r;}
