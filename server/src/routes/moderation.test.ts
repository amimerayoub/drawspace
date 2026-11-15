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
  newId() { this.nextId += 1; return `mod_${this.nextId}`; }
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-moderation', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_moderation', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'mod-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'mod-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'mod-content': { userId: 'u-content', name: 'Content', email: 'content@example.invalid', emailVerified: true, isGuest: false },
  'mod-analyst': { userId: 'u-analyst', name: 'Analyst', email: 'analyst@example.invalid', emailVerified: true, isGuest: false },
  'mod-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const database = { tables, databaseId: 'isolated_moderation', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: { list: async () => ({ users: [], total: 0 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } } } as unknown as AppwriteDatabase;
  for (const [userId, role] of [['u-admin', 'admin'], ['u-mod', 'moderator'], ['u-content', 'content_manager'], ['u-analyst', 'analyst']] as const) {
    await tables.createRow('isolated_moderation', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  const { app } = createApp({ config, database, verifyJwt, game });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables };
}

async function seedReport(tables: IsolatedTables, id: string, status = 'pending') {
  const now = new Date().toISOString();
  await tables.createRow('isolated_moderation', 'moderation_reports', `row_${id}`, {
    id, reporterUserId: 'u-reporter', reporterUsername: 'Reporter', reportedUserId: 'u-target', reportedUsername: 'Target',
    reportType: 'drawing', description: 'Inappropriate drawing in round 2.', roomId: 'ABC123', evidenceReference: '',
    status, assignedModeratorId: '', moderatorNotes: '', resolutionAction: '', createdAt: now, updatedAt: now,
  });
  return id;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string, body: unknown) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const auditRows = (tables: IsolatedTables) => tables.listRows('isolated_moderation', 'audit_logs').then((result) => result.rows);

test('report queue requires the moderation.handle permission', async (t) => {
  const { base, tables } = await startServer(t);
  await seedReport(tables, 'report_gate');
  assert.equal((await fetch(`${base}/api/admin/reports?status=open`)).status, 401);
  for (const token of ['mod-user', 'mod-content', 'mod-analyst']) {
    assert.equal((await fetch(`${base}/api/admin/reports?status=open`, { headers: auth(token) })).status, 403, token);
  }
  for (const token of ['mod-mod', 'mod-admin']) {
    const response = await fetch(`${base}/api/admin/reports?status=open`, { headers: auth(token) });
    assert.equal(response.status, 200, token);
    const body = await response.json() as { data: Array<{ id: string; status: string; detail: string }> };
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, 'report_gate');
    assert.equal(body.data[0].status, 'open');
    assert.equal(body.data[0].detail, 'Inappropriate drawing in round 2.');
  }
});

test('resolving a report stores the custom moderator note and writes an audit entry', async (t) => {
  const { base, tables } = await startServer(t);
  await seedReport(tables, 'report_resolve');
  const reason = 'Confirmed inappropriate drawing. Player warned.';
  const response = await fetch(`${base}/api/admin/reports/report_resolve`, { method: 'PATCH', ...json('mod-mod', { status: 'resolved', reason }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { id: 'report_resolve', status: 'resolved' } });

  const stored = await tables.getRow('isolated_moderation', 'moderation_reports', 'row_report_resolve');
  assert.equal(stored.status, 'resolved');
  assert.equal(stored.moderatorNotes, reason);
  assert.equal(stored.resolutionAction, 'resolved');
  assert.equal(stored.assignedModeratorId, 'u-mod');

  const resolved = await (await fetch(`${base}/api/admin/reports?status=resolved`, { headers: auth('mod-admin') })).json() as { data: Array<{ id: string; moderatorNotes: string; resolutionAction: string; resolvedAt: string }> };
  const row = resolved.data.find((item) => item.id === 'report_resolve');
  assert.ok(row);
  assert.equal(row.moderatorNotes, reason);
  assert.equal(row.resolutionAction, 'resolved');
  assert.ok(row.resolvedAt);

  const audits = await auditRows(tables);
  const entry = audits.find((item) => item.action === 'report.resolved' && item.resourceId === 'report_resolve');
  assert.ok(entry);
  assert.equal(entry.reason, reason);
  assert.equal(entry.actorUserId, 'u-mod');
  assert.equal(entry.resourceType, 'moderation_report');
});

test('dismissing a report records the dismissal action and note', async (t) => {
  const { base, tables } = await startServer(t);
  await seedReport(tables, 'report_dismiss');
  const reason = 'Reviewed the round; no rule violation found.';
  const response = await fetch(`${base}/api/admin/reports/report_dismiss`, { method: 'PATCH', ...json('mod-admin', { status: 'dismissed', reason }) });
  assert.equal(response.status, 200);
  const dismissed = await (await fetch(`${base}/api/admin/reports?status=dismissed`, { headers: auth('mod-mod') })).json() as { data: Array<{ id: string; resolutionAction: string; moderatorNotes: string }> };
  const row = dismissed.data.find((item) => item.id === 'report_dismiss');
  assert.ok(row);
  assert.equal(row.resolutionAction, 'dismissed');
  assert.equal(row.moderatorNotes, reason);
});

test('moderation decisions validate input and report existence', async (t) => {
  const { base, tables } = await startServer(t);
  await seedReport(tables, 'report_validate');
  assert.equal((await fetch(`${base}/api/admin/reports/report_validate`, { method: 'PATCH', ...json('mod-mod', { status: 'resolved', reason: 'ab' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/reports/report_validate`, { method: 'PATCH', ...json('mod-mod', { status: 'open', reason: 'valid reason' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/reports/report_missing`, { method: 'PATCH', ...json('mod-mod', { status: 'resolved', reason: 'valid reason' }) })).status, 404);
  const stillOpen = await tables.getRow('isolated_moderation', 'moderation_reports', 'row_report_validate');
  assert.equal(stillOpen.status, 'pending');
});

test('a report cannot be reviewed twice', async (t) => {
  const { base, tables } = await startServer(t);
  await seedReport(tables, 'report_twice');
  const first = await fetch(`${base}/api/admin/reports/report_twice`, { method: 'PATCH', ...json('mod-mod', { status: 'resolved', reason: 'First decision.' }) });
  assert.equal(first.status, 200);
  const second = await fetch(`${base}/api/admin/reports/report_twice`, { method: 'PATCH', ...json('mod-mod', { status: 'dismissed', reason: 'Second decision.' }) });
  assert.equal(second.status, 409);
  assert.equal((await second.json() as { code: string }).code, 'REPORT_ALREADY_REVIEWED');
  const stored = await tables.getRow('isolated_moderation', 'moderation_reports', 'row_report_twice');
  assert.equal(stored.status, 'resolved');
  assert.equal(stored.moderatorNotes, 'First decision.');
});