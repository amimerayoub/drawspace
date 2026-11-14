import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import type { AdminRole, AdminRoleRepository } from './adminRoleRepository';
import { RowRepository } from './rowRepository';

export type AccountStatus = 'active' | 'suspended' | 'banned';
export interface AdminActor { userId: string; username: string; role: string }

export class AdminUserRepository {
  private readonly profiles: RowRepository;
  private readonly statistics: RowRepository;
  private readonly progression: RowRepository;
  private readonly actions: RowRepository;
  private readonly audit: RowRepository;
  constructor(private readonly database: AppwriteDatabase, private readonly roles: AdminRoleRepository) {
    this.profiles = new RowRepository(database, 'profiles'); this.statistics = new RowRepository(database, 'user_statistics');
    this.progression = new RowRepository(database, 'player_progression'); this.actions = new RowRepository(database, 'moderation_actions');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  async list(options: { search?: string; status?: AccountStatus; role?: string; limit: number; offset: number }) {
    const queries = [Query.limit(options.limit), Query.offset(options.offset)];
    if (options.status) queries.push(Query.equal('status', options.status === 'active'));
    const result = await this.database.users.list({ queries, ...(options.search ? { search: options.search } : {}), total: true });
    const users = result.users;
    const ids = users.map((user) => user.$id);
    if (!ids.length) return { users: [], total: result.total };
    const [profiles, statistics, progression, roles, actions] = await Promise.all([
      this.profiles.list([Query.equal('userId', ids), Query.limit(100)]),
      this.statistics.list([Query.equal('userId', ids), Query.limit(100)]),
      this.progression.list([Query.equal('userId', ids), Query.limit(100)]),
      this.roles.roleRows().then((rows) => rows.filter((row) => ids.includes(String(row.userId)))),
      this.actions.list([Query.equal('targetUserId', ids), Query.limit(500)]),
    ]);
    const roleById = new Map(roles.map((row) => [String(row.userId), row]));
    const profileById = new Map(profiles.map((row) => [String(row.userId), row]));
    const statsById = new Map(statistics.map((row) => [String(row.userId), row]));
    const progressionById = new Map(progression.map((row) => [String(row.userId), row]));
    const actionsById = new Map<string, typeof actions>();
    for (const action of actions) actionsById.set(String(action.targetUserId), [...(actionsById.get(String(action.targetUserId)) || []), action]);
    const mapped = users.map((account) => this.toUser(account, profileById.get(account.$id), statsById.get(account.$id), progressionById.get(account.$id), roleById.get(account.$id), actionsById.get(account.$id) || []));
    const filtered = options.role ? mapped.filter((user) => user.role === options.role) : mapped;
    return { users: filtered, total: options.role ? filtered.length : result.total };
  }

  async get(userId: string) {
    const account = await this.database.users.get(userId);
    const [profile, stats, progression, roleRows, actions] = await Promise.all([
      this.profiles.findOne('userId', userId), this.statistics.findOne('userId', userId), this.progression.findOne('userId', userId),
      this.roles.roleRows().then((rows) => rows.find((row) => row.userId === userId)),
      this.actions.list([Query.equal('targetUserId', userId), Query.limit(100)]),
    ]);
    const user = this.toUser(account, profile || undefined, stats || undefined, progression || undefined, roleRows, actions);
    return { ...user, emailVerified: account.emailVerification, labels: account.labels, activity: { registeredAt: account.registration, lastAccessedAt: account.accessedAt }, moderationActions: actions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20).map((action) => ({ type: String(action.actionType), reason: String(action.reason), at: String(action.createdAt), moderator: String(action.moderatorUsername) })) };
  }

  async updateProfile(userId: string, patch: { username?: string; bio?: string; avatarId?: string }, actor: AdminActor) {
    const account = await this.database.users.get(userId);
    const profile = await this.profiles.findOne('userId', userId);
    if (!profile) throw new Error('Profile not found.');
    if (patch.username !== undefined) await this.database.users.updateName(userId, patch.username);
    const before = String(profile.username);
    try { await this.profiles.patch(profile.$id, {
      ...(patch.username !== undefined ? { username: patch.username, normalizedUsername: patch.username.toLowerCase(), displayName: patch.username } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.avatarId !== undefined ? { avatarId: patch.avatarId } : {}),
      updatedAt: new Date().toISOString(),
    }); } catch (error) { if (patch.username !== undefined) await this.database.users.updateName(userId, account.name).catch(() => undefined); throw error; }
    await this.writeAudit(actor, 'user.profile.update', userId, `username:${before}`, `username:${patch.username ?? before}`);
    return { userId, username: patch.username || account.name, bio: patch.bio ?? String(profile.bio || ''), avatarId: patch.avatarId ?? String(profile.avatarId || 'av-01') };
  }

  async setStatus(userId: string, status: AccountStatus, reason: string, actor: AdminActor) {
    if (userId === actor.userId) throw new Error('You cannot change your own account status.');
    const account = await this.database.users.get(userId);
    const targetRole = await this.roles.getRole(userId);
    if (targetRole && actor.role !== 'superadmin') throw new Error('Only a superadmin can moderate a staff account.');
    await this.database.users.updateStatus(userId, status === 'active');
    const now = new Date().toISOString();
    const actionType = status === 'active' ? 'unban' : status === 'banned' ? 'ban' : 'suspend';
    try {
      await this.actions.insert({ id: `mod_${randomUUID()}`, targetUserId: userId, targetUsername: account.name.slice(0, 32) || 'Player', moderatorUserId: actor.userId, moderatorUsername: actor.username.slice(0, 32) || 'Admin', actionType, reason: reason.slice(0, 255), createdAt: now, expiresAt: '' });
      await this.writeAudit(actor, `user.${actionType}`, userId, String(account.status), status, reason);
    } catch (error) { await this.database.users.updateStatus(userId, account.status).catch(() => undefined); throw error; }
    return { userId, status };
  }

  async assignRole(userId: string, role: AdminRole | null, actor: AdminActor) {
    const account = await this.database.users.get(userId);
    return this.roles.assign(userId, role, actor, account.name || 'Player', 'Admin role updated through the user management screen.');
  }

  private toUser(account: Awaited<ReturnType<AppwriteDatabase['users']['get']>>, profile?: Record<string, unknown> | null, stats?: Record<string, unknown> | null, progression?: Record<string, unknown> | null, roleRow?: Record<string, unknown> | null, actions: Array<Record<string, unknown>> = []) {
    const latest = [...actions].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const status: AccountStatus = account.status ? 'active' : latest?.actionType === 'ban' ? 'banned' : 'suspended';
    const userRole = roleRow?.isActive === true ? String(roleRow.role) : profile?.accountType === 'guest' ? 'guest' : 'player';
    return {
      id: account.$id, username: String(profile?.username || account.name || 'Player'), email: account.email || undefined,
      avatarId: String(profile?.avatarId || 'av-01'), bio: String(profile?.bio || ''), role: userRole,
      status, level: Number(progression?.currentLevel) || 1, xp: Number(progression?.totalXP) || 0,
      titleId: String(progression?.equippedTitleId || '') || null, createdAt: String(profile?.createdAt || account.registration),
      lastSeenAt: String(account.accessedAt || account.registration),
      stats: { matches: Number(stats?.totalGames) || 0, wins: Number(stats?.gamesWon) || 0, correctGuesses: Number(stats?.correctGuesses) || 0, wordsDrawn: 0, totalScore: Number(stats?.totalPoints) || 0, bestScore: 0 },
      locale: 'en-US' as const,
    };
  }

  private async writeAudit(actor: AdminActor, action: string, resourceId: string, before: string, after: string, reason = '') {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32), actorRole: actor.role, action, ipAddress: '', resourceType: 'user', resourceId: resourceId.slice(0, 64), status: 'success', reason: `${before} => ${after}${reason ? `; ${reason}` : ''}`.slice(0, 255), createdAt: new Date().toISOString() });
  }
}
