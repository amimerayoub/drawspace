import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../app';
import { type AppwriteDatabase } from '../database/appwrite';
import type { ServerConfig } from '../config/env';
import { GameEngine } from '../game/engine';
import { InMemoryRoomStateStore } from '../state/roomStateStore';

class IsolatedTables {
  private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  readonly missing = new Set<string>();
  private nextId = 0;
  private table(id: string) { let rows = this.tables.get(id); if (!rows) { rows = new Map(); this.tables.set(id, rows); } return rows; }
  async createRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 409 }); const row = { ...structuredClone(data), $id: id }; rows.set(id, row); return structuredClone(row); }
  async getRow(_d: string, tableId: string, id: string) { const row = this.table(tableId).get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); return structuredClone(row); }
  async updateRow(_d: string, tableId: string, id: string, data: Record<string, unknown>) { const rows = this.table(tableId); const row = rows.get(id); if (!row) throw Object.assign(new Error('missing'), { code: 404 }); const updated = { ...row, ...structuredClone(data) }; rows.set(id, updated); return structuredClone(updated); }
  async deleteRow(_d: string, tableId: string, id: string) { this.table(tableId).delete(id); }
  async listRows(_d: string, tableId: string, queries: string[] = []) {
    if (this.missing.has(tableId)) throw Object.assign(new Error('missing'), { code: 404 });
    let rows = [...this.table(tableId).values()]; let limit = 25; let offset = 0;
    for (const encoded of queries) { const q = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] }; if (q.method === 'equal' && q.attribute) rows = rows.filter((row) => q.values?.includes(row[q.attribute!])); if (q.method === 'limit') limit = Number(q.values?.[0]); if (q.method === 'offset') offset = Number(q.values?.[0]); }
    return { rows: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async listTables() { return { total: 0, tables: [] }; }
  newId() { this.nextId += 1; return `crm_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-crm', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_crm', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'crm-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'crm-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'crm-content': { userId: 'u-content', name: 'Content', email: 'content@example.invalid', emailVerified: true, isGuest: false },
  'crm-analyst': { userId: 'u-analyst', name: 'Analyst', email: 'analyst@example.invalid', emailVerified: true, isGuest: false },
  'crm-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

const DAY = 86_400_000;
async function seedPlayers(tables: IsolatedTables) {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const profiles = [
    { userId: 'u1', accountType: 'registered', createdAt: iso(now) },
    { userId: 'u2', accountType: 'guest', createdAt: iso(now - 40 * DAY) },
    { userId: 'u3', accountType: 'registered', createdAt: iso(now - 40 * DAY) },
    { userId: 'u4', accountType: 'registered', createdAt: iso(now - 10 * DAY) },
    { userId: 'u5', accountType: 'registered', createdAt: iso(now - 40 * DAY) },
  ];
  for (const p of profiles) await tables.createRow('isolated_crm', 'profiles', `p_${p.userId}`, { ...p, updatedAt: p.createdAt });
  await tables.createRow('isolated_crm', 'player_progression', 'pg_u1', { userId: 'u1', currentLevel: 12, totalXP: 1200, updatedAt: iso(now) });
  await tables.createRow('isolated_crm', 'player_progression', 'pg_u3', { userId: 'u3', currentLevel: 5, totalXP: 300, updatedAt: iso(now - 40 * DAY) });
  await tables.createRow('isolated_crm', 'player_progression', 'pg_u4', { userId: 'u4', currentLevel: 20, totalXP: 4000, updatedAt: iso(now - 1 * DAY) });
  await tables.createRow('isolated_crm', 'user_statistics', 'st_u5', { userId: 'u5', totalGames: 3, updatedAt: iso(now - 1 * DAY) });
}

async function startServer(t: { after: (fn: () => Promise<void>) => void }, seed = true) {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_crm', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: { list: async () => ({ users: [], total: 0 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } } } as unknown as AppwriteDatabase;
  for (const [userId, role] of [['u-admin', 'admin'], ['u-mod', 'moderator'], ['u-content', 'content_manager'], ['u-analyst', 'analyst']] as const) {
    await tables.createRow('isolated_crm', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  if (seed) await seedPlayers(tables);
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  const { app } = createApp({ config, database, verifyJwt, game });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string, body: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const auditRows = (tables: IsolatedTables) => tables.listRows('isolated_crm', 'audit_logs').then((result) => result.rows);
const campaign = { segment: 'Level 10+', subject: 'Season starts', body: 'A new season begins today.' };
type CrmPayload = { data: { messages: Array<{ id: string; segment: string; status: string; recipients: number; sentAt: string }>; segments: Array<{ segment: string; count: number }> } };

test('CRM requires the crm.send permission', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/crm`)).status, 401);
  for (const token of ['crm-user', 'crm-mod', 'crm-content', 'crm-analyst']) assert.equal((await fetch(`${base}/api/admin/crm`, { headers: auth(token) })).status, 403, token);
  assert.equal((await fetch(`${base}/api/admin/crm`, { headers: auth('crm-admin') })).status, 200);
});

test('segment audiences are computed from real player data', async (t) => {
  const { base } = await startServer(t);
  const payload = await (await fetch(`${base}/api/admin/crm`, { headers: auth('crm-admin') })).json() as CrmPayload;
  const counts = Object.fromEntries(payload.data.segments.map((s) => [s.segment, s.count]));
  assert.equal(counts['All players'], 5);
  assert.equal(counts['Guests'], 1);
  assert.equal(counts['New this week'], 1);
  assert.equal(counts['Level 10+'], 2);
  assert.equal(counts['Inactive 30 days'], 2);
});

test('drafts and sends persist with live audience counts and audit', async (t) => {
  const { base, tables } = await startServer(t);
  const created = await fetch(`${base}/api/admin/crm`, { method: 'PUT', ...json('crm-admin', { ...campaign, status: 'draft' }) });
  assert.equal(created.status, 200);
  const draft = (await created.json() as { data: { id: string; status: string; recipients: number; sentAt: string } }).data;
  assert.equal(draft.status, 'draft');
  assert.equal(draft.recipients, 2, 'draft audience reflects the live Level 10+ segment');
  assert.equal(draft.sentAt, '');

  const sent = await fetch(`${base}/api/admin/crm/${draft.id}/send`, { method: 'POST', headers: auth('crm-admin') });
  assert.equal(sent.status, 200);
  const sentBody = (await sent.json() as { data: { status: string; recipients: number; sentAt: string } }).data;
  assert.equal(sentBody.status, 'sent');
  assert.equal(sentBody.recipients, 2);
  assert.ok(sentBody.sentAt, 'send records a timestamp');

  const list = await (await fetch(`${base}/api/admin/crm`, { headers: auth('crm-admin') })).json() as CrmPayload;
  assert.equal(list.data.messages.length, 1);
  assert.equal(list.data.messages[0].status, 'sent');

  const audits = await auditRows(tables);
  assert.ok(audits.some((row) => row.action === 'crm.save' && row.resourceId === draft.id));
  assert.ok(audits.some((row) => row.action === 'crm.send' && row.resourceId === draft.id));
});

test('CRM validates campaigns and reports missing records', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/crm`, { method: 'PUT', ...json('crm-admin', { ...campaign, segment: 'VIPs' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/crm`, { method: 'PUT', ...json('crm-admin', { ...campaign, subject: '' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/crm`, { method: 'PUT', ...json('crm-admin', { ...campaign, body: '' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/crm/does-not-exist/send`, { method: 'POST', headers: auth('crm-admin') })).status, 404);
  assert.equal((await fetch(`${base}/api/admin/crm/does-not-exist`, { method: 'DELETE', headers: auth('crm-admin') })).status, 404);
});

test('campaigns can be edited and deleted with audit', async (t) => {
  const { base, tables } = await startServer(t);
  const created = (await (await fetch(`${base}/api/admin/crm`, { method: 'PUT', ...json('crm-admin', { ...campaign, status: 'draft' }) })).json() as { data: { id: string } }).data;
  const updated = await fetch(`${base}/api/admin/crm`, { method: 'PUT', ...json('crm-admin', { id: created.id, segment: 'Guests', subject: 'Guest welcome', body: 'Welcome aboard.', status: 'draft' }) });
  assert.equal(updated.status, 200);
  const updatedBody = (await updated.json() as { data: { segment: string; recipients: number } }).data;
  assert.equal(updatedBody.segment, 'Guests');
  assert.equal(updatedBody.recipients, 1, 'audience recomputed for the new segment');

  assert.equal((await fetch(`${base}/api/admin/crm/${created.id}`, { method: 'DELETE', headers: auth('crm-admin') })).status, 200);
  const list = await (await fetch(`${base}/api/admin/crm`, { headers: auth('crm-admin') })).json() as CrmPayload;
  assert.equal(list.data.messages.length, 0);
  const audits = await auditRows(tables);
  assert.ok(audits.some((row) => row.action === 'crm.delete' && row.resourceId === created.id));
});

test('CRM degrades gracefully when its table is missing', async (t) => {
  const { base, tables } = await startServer(t);
  tables.missing.add('crm_messages');
  const payload = await (await fetch(`${base}/api/admin/crm`, { headers: auth('crm-admin') })).json() as CrmPayload;
  assert.deepEqual(payload.data.messages, []);
  assert.equal(payload.data.segments.find((s) => s.segment === 'All players')?.count, 5, 'audiences still compute from player tables');
});