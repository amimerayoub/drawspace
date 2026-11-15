import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import { type AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, hasAnyPermission, hasPermission, permissionsForRole } from '../auth/permissions';

class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 }); const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row); }
  async getRow(_d: string, tableId: string, id: string) { const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row); }
  async updateRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated); }
  async deleteRow(_d: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_d: string, tableId: string, queries: string[] = []) {
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute) rows = rows.filter((row) => q.values?.includes(row[q.attribute!])); if (q.method === 'limit') limit = Number(q.values?.[0]); if (q.method === 'offset') offset = Number(q.values?.[0]); }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `perms_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-perms', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_perms', frontendOrigins: [], roomStateDriver: 'memory' };

const staff = [
  { token: 'perm-super', userId: 'u-super', name: 'Super', role: 'superadmin' },
  { token: 'perm-admin', userId: 'u-admin', name: 'Admin', role: 'admin' },
  { token: 'perm-mod', userId: 'u-mod', name: 'Mod', role: 'moderator' },
  { token: 'perm-content', userId: 'u-content', name: 'Content', role: 'content_manager' },
  { token: 'perm-analyst', userId: 'u-analyst', name: 'Analyst', role: 'analyst' },
  { token: 'perm-support', userId: 'u-support', name: 'Support', role: 'support' },
] as const;

const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'perm-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
  'perm-target': { userId: 'u-target', name: 'Target', email: 'target@example.invalid', emailVerified: true, isGuest: false },
};
for (const member of staff) identities[member.token] = { userId: member.userId, name: member.name, email: `${member.userId}@example.invalid`, emailVerified: true, isGuest: false };
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

const accountIds = [...staff.map((member) => member.userId), 'u-normal', 'u-target'];
function makeUsersDouble() {
  const accounts = accountIds.map((id) => ({ $id: id, name: id, email: `${id}@example.invalid`, status: true, emailVerification: true, labels: [] as string[], registration: '2026-01-01T00:00:00.000Z', accessedAt: '2026-11-01T00:00:00.000Z' }));
  return {
    get: async (id: string) => { const account = accounts.find((entry) => entry.$id === id); if (!account) throw Object.assign(new Error('User not found'), { code: 404 }); return structuredClone(account); },
    list: async ({ queries = [] }: { queries?: string[] }) => {
      let rows = [...accounts]; let limit = 25; let offset = 0;
      for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute === 'status') rows = rows.filter((row) => q.values?.includes(row.status)); if (q.method === 'limit') limit = Number(q.values?.[0]); if (q.method === 'offset') offset = Number(q.values?.[0]); }
      return { users: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
    },
    updateStatus: async (id: string, status: boolean) => { const account = accounts.find((entry) => entry.$id === id); if (account) account.status = status; return structuredClone(account); },
    updateName: async (id: string, name: string) => { const account = accounts.find((entry) => entry.$id === id); if (account) account.name = name; return structuredClone(account); },
  };
}

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_perms', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: makeUsersDouble() } as unknown as AppwriteDatabase;
  for (const member of staff) await tables.createRow('isolated_perms', 'admin_roles', `role_${member.userId}`, { userId: member.userId, role: member.role, isActive: true });
  const { app } = createApp({ config, database, verifyJwt });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables, database };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string, body: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('permission matrix grants least-privilege access per role', () => {
  for (const permission of ALL_PERMISSIONS) {
    assert.equal(hasPermission('superadmin', permission), true);
    assert.equal(hasPermission('admin', permission), true);
  }
  assert.deepEqual(permissionsForRole('superadmin'), ALL_PERMISSIONS);
  assert.deepEqual(permissionsForRole('admin'), ALL_PERMISSIONS);

  assert.equal(hasPermission('moderator', 'moderation.handle'), true);
  assert.equal(hasPermission('moderator', 'users.view'), true);
  assert.equal(hasPermission('moderator', 'words.manage'), false);
  assert.equal(hasPermission('moderator', 'settings.manage'), false);

  assert.equal(hasPermission('content_manager', 'words.manage'), true);
  assert.equal(hasPermission('content_manager', 'content.blog'), true);
  assert.equal(hasPermission('content_manager', 'settings.manage'), false);
  assert.equal(hasPermission('content_manager', 'rewards.manage'), false);
  assert.equal(hasPermission('content_manager', 'roles.manage'), false);

  for (const role of ['analyst', 'support'] as const) {
    assert.equal(hasPermission(role, 'analytics.view'), true);
    assert.equal(hasPermission(role, 'audit.view'), true);
    assert.equal(hasPermission(role, 'users.view'), false);
    assert.equal(hasPermission(role, 'words.manage'), false);
  }
  assert.equal(hasAnyPermission('content_manager', ['settings.manage', 'words.manage']), true);
  assert.equal(hasAnyPermission('content_manager', ['settings.manage', 'rewards.manage']), false);
  assert.equal(ROLE_PERMISSIONS.superadmin.includes('*'), true);
});

test('GET /api/admin/permissions is gated to roles.manage and returns the enforced matrix', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/permissions`)).status, 401);
  for (const token of ['perm-user', 'perm-content', 'perm-mod', 'perm-analyst', 'perm-support']) {
    assert.equal((await fetch(`${base}/api/admin/permissions`, { headers: auth(token) })).status, 403, token);
  }
  const response = await fetch(`${base}/api/admin/permissions`, { headers: auth('perm-admin') });
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.equal(data.totalPermissions, ALL_PERMISSIONS.length);
  assert.equal(data.permissions.length, ALL_PERMISSIONS.length);
  assert.deepEqual(data.assignableRoles, ['superadmin', 'admin', 'moderator', 'content_manager', 'analyst', 'support']);
  const moderator = data.roles.find((entry: { role: string }) => entry.role === 'moderator');
  assert.deepEqual(moderator.permissions, permissionsForRole('moderator'));
  const superadmin = data.roles.find((entry: { role: string }) => entry.role === 'superadmin');
  assert.deepEqual(superadmin.permissions, ALL_PERMISSIONS);
});

test('routes enforce the matrix: content_manager, moderator, and support reach only their permitted endpoints', async (t) => {
  const { base } = await startServer(t);
  const status = async (token: string, path: string) => (await fetch(`${base}${path}`, { headers: auth(token) })).status;

  assert.equal(await status('perm-content', '/api/admin/catalog/words'), 200);
  assert.equal(await status('perm-content', '/api/admin/catalog/titles'), 403);
  assert.equal(await status('perm-content', '/api/admin/game-settings'), 403);

  assert.equal(await status('perm-mod', '/api/admin/reports'), 200);
  assert.equal(await status('perm-mod', '/api/admin/users'), 200);
  assert.equal(await status('perm-mod', '/api/admin/catalog/words'), 403);

  assert.equal(await status('perm-support', '/api/admin/content/audit'), 200);
  assert.equal(await status('perm-support', '/api/admin/users'), 403);
  assert.equal(await status('perm-support', '/api/admin/reports'), 403);

  assert.equal(await status('perm-user', '/api/admin/catalog/words'), 403);
});

test('role assignment is superadmin-only, blocks self-changes, and writes an audit row', async (t) => {
  const { base, tables } = await startServer(t);

  const forbidden = await fetch(`${base}/api/admin/users/u-target/role`, { method: 'PATCH', ...json('perm-admin', { role: 'moderator', reason: 'Admin attempting assignment' }) });
  assert.equal(forbidden.status, 403);

  const selfChange = await fetch(`${base}/api/admin/users/u-super/role`, { method: 'PATCH', ...json('perm-super', { role: 'admin', reason: 'Trying to demote myself' }) });
  assert.equal(selfChange.status, 409);
  assert.equal((await selfChange.json()).code, 'ROLE_CHANGE_CONFLICT');

  const assigned = await fetch(`${base}/api/admin/users/u-target/role`, { method: 'PATCH', ...json('perm-super', { role: 'moderator', reason: 'Promoting a trusted player' }) });
  assert.equal(assigned.status, 200);
  assert.deepEqual((await assigned.json()).data, { userId: 'u-target', role: 'moderator' });

  let audit = (await tables.listRows('isolated_perms', 'audit_logs')).rows;
  const assignRow = audit.find((row) => row.action === 'admin_role.assign' && row.resourceId === 'u-target');
  assert.ok(assignRow, 'expected an admin_role.assign audit row');
  assert.equal(assignRow.actorUserId, 'u-super');
  assert.equal(assignRow.status, 'success');
  assert.match(String(assignRow.reason), /moderator:/);

  const revoked = await fetch(`${base}/api/admin/users/u-target/role`, { method: 'PATCH', ...json('perm-super', { role: null, reason: 'Removing the test role' }) });
  assert.equal(revoked.status, 200);
  assert.deepEqual((await revoked.json()).data, { userId: 'u-target', role: null });
  audit = (await tables.listRows('isolated_perms', 'audit_logs')).rows;
  assert.ok(audit.some((row) => row.action === 'admin_role.revoke' && row.resourceId === 'u-target'), 'expected an admin_role.revoke audit row');
});

test('the last active superadmin cannot be demoted', async (t) => {
  const { database } = await startServer(t);
  const roles = new AdminRoleRepository(database);
  await assert.rejects(
    () => roles.assign('u-super', 'admin', { userId: 'u-admin', username: 'Admin', role: 'admin' }, 'Super', 'Demoting the only superadmin'),
    /last active superadmin/,
  );
});