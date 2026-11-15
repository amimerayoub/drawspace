import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';
import { randomUUID } from 'node:crypto';

export type AdminRole = 'superadmin' | 'admin' | 'moderator' | 'content_manager' | 'analyst' | 'support';

export class AdminRoleRepository {
  private readonly rows: RowRepository;
  private readonly audit: RowRepository;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'admin_roles'); this.audit = new RowRepository(database, 'audit_logs'); }

  async getRole(userId: string): Promise<AdminRole | null> {
    const rows = await this.rows.list([Query.equal('userId', userId), Query.equal('isActive', true), Query.limit(1)]);
    const role = rows[0]?.role;
    return typeof role === 'string' && ['superadmin', 'admin', 'moderator', 'content_manager', 'analyst', 'support'].includes(role)
      ? role as AdminRole
      : null;
  }

  async assign(userId: string, role: AdminRole | null, actor: { userId: string; username: string; role: string }, username: string, reason: string) {
    if (actor.userId === userId) throw new Error('You cannot change your own admin role.');
    const existing = await this.rows.findOne('userId', userId);
    const activeSuperadmins = await this.rows.list([Query.equal('role', 'superadmin'), Query.equal('isActive', true), Query.limit(100)]);
    if (existing?.role === 'superadmin' && existing.isActive === true && role !== 'superadmin' && activeSuperadmins.length <= 1) throw new Error('The last active superadmin cannot be removed.');
    const now = new Date().toISOString();
    if (role) {
      const data = { userId, username: username.slice(0, 32), role, isActive: true, assignedAt: now, assignedBy: actor.userId };
      if (existing) await this.rows.patch(existing.$id, data); else await this.rows.insert(data);
    } else if (existing) await this.rows.patch(existing.$id, { isActive: false, assignedAt: now, assignedBy: actor.userId });
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32), actorRole: actor.role, action: role ? 'admin_role.assign' : 'admin_role.revoke', ipAddress: '', resourceType: 'admin_role', resourceId: userId, status: 'success', reason: `${role || 'revoked'}: ${reason}`.slice(0, 255), createdAt: now });
    return { userId, role };
  }

  async roleRows() { return this.rows.list([Query.limit(1000)]); }
}
