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
  async listColumns() { return { columns: [] }; }
  newId() { this.nextId += 1; return `md_${this.nextId}`; }
}

function makeStorage() {
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  let failCreate = false;
  return {
    files,
    setFailCreate(value: boolean) { failCreate = value; },
    async createFile(_bucket: string, fileId: string, file: File) {
      if (failCreate) throw Object.assign(new Error('bucket missing'), { code: 404 });
      files.set(fileId, { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type });
      return { $id: fileId };
    },
    async deleteFile(_bucket: string, fileId: string) { files.delete(fileId); },
    async getFileView(_bucket: string, fileId: string) {
      const file = files.get(fileId);
      if (!file) throw Object.assign(new Error('missing'), { code: 404 });
      return Uint8Array.from(file.bytes).buffer;
    },
  };
}

const config: ServerConfig = { nodeEnv: 'test', port: 0, appwriteEndpoint: 'http://127.0.0.1', appwriteProjectId: 'isolated-media', appwriteApiKey: 'test-only-placeholder', databaseId: 'isolated_media', frontendOrigins: [], roomStateDriver: 'memory' };
const identities: Record<string, { userId: string; name: string; email: string | null; emailVerified: boolean; isGuest: boolean }> = {
  'md-admin': { userId: 'u-admin', name: 'Admin', email: 'admin@example.invalid', emailVerified: true, isGuest: false },
  'md-content': { userId: 'u-content', name: 'Content', email: 'content@example.invalid', emailVerified: true, isGuest: false },
  'md-mod': { userId: 'u-mod', name: 'Mod', email: 'mod@example.invalid', emailVerified: true, isGuest: false },
  'md-user': { userId: 'u-normal', name: 'Normal', email: null, emailVerified: false, isGuest: true },
};
const verifyJwt = async (jwt: string) => { const identity = identities[jwt]; if (!identity) throw new Error('invalid test token'); return identity; };

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const tables = new IsolatedTables();
  const storage = makeStorage();
  const database = { tables, storage, databaseId: 'isolated_media', newId: () => tables.newId(), accountForJwt: () => { throw new Error('test verifier used'); }, users: { list: async () => ({ users: [], total: 0 }), get: async () => { throw Object.assign(new Error('not found'), { code: 404 }); } } } as unknown as AppwriteDatabase;
  for (const [userId, role] of [['u-admin', 'admin'], ['u-content', 'content_manager'], ['u-mod', 'moderator']] as const) {
    await tables.createRow('isolated_media', 'admin_roles', `role_${userId}`, { userId, role, isActive: true });
  }
  const game = new GameEngine(Date.now, new InMemoryRoomStateStore());
  const { app } = createApp({ config, database, verifyJwt, game });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>((resolve) => httpServer.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, tables, storage };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const auditRows = (tables: IsolatedTables) => tables.listRows('isolated_media', 'audit_logs').then((result) => result.rows);
const pngBytes = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const upload = (base: string, token: string, name: string, kind: string, bytes: Uint8Array) =>
  fetch(`${base}/api/admin/media/upload?name=${encodeURIComponent(name)}&kind=${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: bytes.buffer as ArrayBuffer });

test('media management requires the content.media permission', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await fetch(`${base}/api/admin/media`)).status, 401);
  for (const token of ['md-user', 'md-mod']) assert.equal((await fetch(`${base}/api/admin/media`, { headers: auth(token) })).status, 403, token);
  for (const token of ['md-content', 'md-admin']) assert.equal((await fetch(`${base}/api/admin/media`, { headers: auth(token) })).status, 200, token);
});

test('upload stores a file in storage, lists it, and serves it publicly', async (t) => {
  const { base, tables, storage } = await startServer(t);
  const bytes = pngBytes();
  const response = await upload(base, 'md-content', 'logo.png', 'image', bytes);
  assert.equal(response.status, 201);
  const asset = (await response.json() as { data: { id: string; name: string; kind: string; size: number; url: string } }).data;
  assert.equal(asset.name, 'logo.png');
  assert.equal(asset.kind, 'image');
  assert.equal(asset.size, bytes.byteLength);
  assert.equal(asset.url, `/api/media/${asset.id}/view`);
  assert.equal(storage.files.size, 1);

  const list = await (await fetch(`${base}/api/admin/media`, { headers: auth('md-content') })).json() as { data: Array<{ id: string }> };
  assert.equal(list.data.length, 1);

  const view = await fetch(`${base}${asset.url}`);
  assert.equal(view.status, 200);
  assert.equal(view.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await view.arrayBuffer()), bytes);

  const audits = await auditRows(tables);
  assert.ok(audits.some((row) => row.action === 'media.upload' && row.resourceId === asset.id));
});

test('rename and delete update storage and audit', async (t) => {
  const { base, tables, storage } = await startServer(t);
  const asset = (await (await upload(base, 'md-admin', 'old.png', 'image', pngBytes())).json() as { data: { id: string } }).data;
  const renamed = await fetch(`${base}/api/admin/media/${asset.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer md-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'new.png' }) });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json() as { data: { name: string } }).data.name, 'new.png');

  assert.equal((await fetch(`${base}/api/admin/media/${asset.id}`, { method: 'DELETE', headers: auth('md-admin') })).status, 200);
  assert.equal(storage.files.size, 0);
  const list = await (await fetch(`${base}/api/admin/media`, { headers: auth('md-admin') })).json() as { data: unknown[] };
  assert.equal(list.data.length, 0);
  const audits = await auditRows(tables);
  assert.ok(audits.some((row) => row.action === 'media.rename'));
  assert.ok(audits.some((row) => row.action === 'media.delete'));
});

test('media validates uploads and handles missing assets', async (t) => {
  const { base } = await startServer(t);
  assert.equal((await upload(base, 'md-admin', '', 'image', pngBytes())).status, 400);
  assert.equal((await fetch(`${base}/api/admin/media/upload?name=x.png&kind=image`, { method: 'POST', headers: { Authorization: 'Bearer md-admin', 'Content-Type': 'image/png' }, body: new Uint8Array(0).buffer as ArrayBuffer })).status, 400);
  assert.equal((await fetch(`${base}/api/media/missing/view`)).status, 404);
  assert.equal((await fetch(`${base}/api/admin/media/missing`, { method: 'DELETE', headers: auth('md-admin') })).status, 404);
});

test('upload surfaces a clear error when storage is unavailable', async (t) => {
  const { base, storage } = await startServer(t);
  storage.setFailCreate(true);
  const response = await upload(base, 'md-admin', 'logo.png', 'image', pngBytes());
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code: string }).code, 'STORAGE_UNAVAILABLE');
});

test('media list degrades gracefully when the table is missing', async (t) => {
  const { base, tables } = await startServer(t);
  tables.missing.add('media_assets');
  const list = await (await fetch(`${base}/api/admin/media`, { headers: auth('md-admin') })).json() as { data: unknown[] };
  assert.deepEqual(list.data, []);
});