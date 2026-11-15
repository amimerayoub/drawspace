import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Client, Storage, TablesDB } from 'node-appwrite';

// Additive, idempotent migration for the admin-dashboard features (XP config, SEO,
// redirects, media library, CRM) plus the extended platform branding columns and the
// private media Storage bucket. Dry-run by default; refuses production.
// See docs/APPWRITE_SCHEMA_MIGRATIONS.md. Never prints secrets or row data.

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = args.has('--dry-run') || !apply;
const env = process.env.APPWRITE_ENV;
if (!env || !['development', 'staging'].includes(env)) throw new Error('Set APPWRITE_ENV explicitly to development or staging. This script refuses production.');
const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.DATABASE_ID || 'drawspace_db';
const bucketId = process.env.STORAGE_BUCKET_ID || 'media';
if (!endpoint || !projectId || !apiKey) throw new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY are required. Values are never printed.');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tables = new TablesDB(client);
const storage = new Storage(client);

const waitForAvailable = async (read, label) => {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const resource = await read();
    if (resource.status === 'available') return;
    if (['failed', 'stuck', 'deleting'].includes(resource.status)) throw new Error(`${label} entered ${resource.status}; migration stopped safely.`);
    if (Date.now() > deadline) throw new Error(`${label} did not become available within 60 seconds; migration stopped safely.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};
const getTable = async (id) => { try { return await tables.getTable(databaseId, id); } catch (error) { if (error?.code === 404) return null; throw error; } };
const columnsOf = async (id) => (await tables.listColumns(databaseId, id, [])).columns;
const indexesOf = async (id) => (await tables.listIndexes(databaseId, id, [])).indexes;

// Column spec: { key, type: string|integer|float|boolean, size?, required?, min?, max?, default?, array? }
const newTables = [
  {
    id: 'xp_config', name: 'XP Configuration',
    columns: [
      { key: 'correctGuessXp', type: 'integer', min: 0, max: 200, default: 15 },
      { key: 'winBonusXp', type: 'integer', min: 0, max: 500, default: 30 },
      { key: 'challengeMultiplier', type: 'float', min: 0.5, max: 5, default: 1 },
      { key: 'levelBase', type: 'integer', min: 10, max: 5000, default: 100 },
      { key: 'levelGrowth', type: 'float', min: 1, max: 2, default: 1.18 },
      { key: 'updatedAt', type: 'string', size: 64, default: '' },
      { key: 'updatedBy', type: 'string', size: 36, default: '' },
    ],
    indexes: [],
  },
  {
    id: 'seo_records', name: 'SEO Records',
    columns: [
      { key: 'route', type: 'string', size: 200, required: true },
      { key: 'title', type: 'string', size: 70, default: '' },
      { key: 'description', type: 'string', size: 170, default: '' },
      { key: 'canonical', type: 'string', size: 300, default: '' },
      { key: 'ogTitle', type: 'string', size: 70, default: '' },
      { key: 'ogDescription', type: 'string', size: 170, default: '' },
      { key: 'robots', type: 'string', size: 16, default: 'index' },
      { key: 'structuredData', type: 'string', size: 5000, default: '' },
      { key: 'updatedAt', type: 'string', size: 64, default: '' },
    ],
    indexes: [{ key: 'idx_route', type: 'unique', columns: ['route'] }],
  },
  {
    id: 'redirect_rules', name: 'Redirect Rules',
    columns: [
      { key: 'id', type: 'string', size: 64, required: true },
      { key: 'fromPath', type: 'string', size: 200, required: true },
      { key: 'toPath', type: 'string', size: 200, required: true },
      { key: 'code', type: 'integer', min: 301, max: 302, default: 301 },
      { key: 'hits', type: 'integer', min: 0, max: 2147483647, default: 0 },
      { key: 'updatedAt', type: 'string', size: 64, default: '' },
    ],
    indexes: [{ key: 'idx_id', type: 'unique', columns: ['id'] }, { key: 'idx_fromPath', type: 'unique', columns: ['fromPath'] }],
  },
  {
    id: 'media_assets', name: 'Media Assets',
    columns: [
      { key: 'id', type: 'string', size: 64, required: true },
      { key: 'name', type: 'string', size: 255, default: '' },
      { key: 'kind', type: 'string', size: 16, default: 'image' },
      { key: 'size', type: 'integer', min: 0, max: 2147483647, default: 0 },
      { key: 'mimeType', type: 'string', size: 128, default: '' },
      { key: 'fileId', type: 'string', size: 64, default: '' },
      { key: 'createdAt', type: 'string', size: 64, default: '' },
      { key: 'uploadedBy', type: 'string', size: 36, default: '' },
    ],
    indexes: [{ key: 'idx_id', type: 'unique', columns: ['id'] }, { key: 'idx_createdAt', type: 'key', columns: ['createdAt'], orders: ['desc'] }],
  },
  {
    id: 'crm_messages', name: 'CRM Campaigns',
    columns: [
      { key: 'id', type: 'string', size: 64, required: true },
      { key: 'segment', type: 'string', size: 32, default: '' },
      { key: 'subject', type: 'string', size: 90, default: '' },
      { key: 'body', type: 'string', size: 5000, default: '' },
      { key: 'status', type: 'string', size: 16, default: 'draft' },
      { key: 'recipients', type: 'integer', min: 0, max: 2147483647, default: 0 },
      { key: 'sentAt', type: 'string', size: 64, default: '' },
      { key: 'createdAt', type: 'string', size: 64, default: '' },
      { key: 'updatedAt', type: 'string', size: 64, default: '' },
    ],
    indexes: [{ key: 'idx_id', type: 'unique', columns: ['id'] }],
  },
];

// Additive optional branding columns on the existing platform_settings singleton.
const platformSettingsAdds = [
  { key: 'logoUrl', type: 'string', size: 500, default: '' },
  { key: 'faviconUrl', type: 'string', size: 500, default: '' },
  { key: 'announcement', type: 'string', size: 500, default: '' },
  { key: 'seoTitle', type: 'string', size: 70, default: '' },
  { key: 'seoDescription', type: 'string', size: 170, default: '' },
];

const createColumn = async (tableId, col) => {
  if (col.type === 'string') await tables.createStringColumn(databaseId, tableId, col.key, col.size, col.required ?? false, col.default ?? '', col.array ?? false);
  else if (col.type === 'integer') await tables.createIntegerColumn(databaseId, tableId, col.key, col.required ?? false, col.min ?? null, col.max ?? null, col.default ?? null, col.array ?? false);
  else if (col.type === 'float') await tables.createFloatColumn(databaseId, tableId, col.key, col.required ?? false, col.min ?? null, col.max ?? null, col.default ?? null, col.array ?? false);
  else await tables.createBooleanColumn(databaseId, tableId, col.key, col.required ?? false, col.default ?? false, col.array ?? false);
  await waitForAvailable(() => tables.getColumn(databaseId, tableId, col.key), `Column ${tableId}.${col.key}`);
};

const compatible = (found, col) => {
  if (!found) return true;
  if (found.type !== col.type) return false;
  if (col.type === 'string' && Number(found.size) < col.size) return false;
  if (Boolean(found.required) !== Boolean(col.required ?? false)) return false;
  return true;
};

// ---- Inspect live state ----
const platformSettings = await getTable('platform_settings');
if (!platformSettings) throw new Error('Expected platform_settings to exist; inspect manually. No changes applied.');
const platformCols = await columnsOf('platform_settings');

const inspected = [];
for (const spec of newTables) {
  const table = await getTable(spec.id);
  const columns = table ? await columnsOf(spec.id) : [];
  const indexes = table ? await indexesOf(spec.id) : [];
  if (table) {
    if (table.rowSecurity !== true) throw new Error(`Existing table ${spec.id} must have row security enabled; no changes applied.`);
    if (Array.isArray(table.$permissions) && table.$permissions.length) throw new Error(`Existing table ${spec.id} has direct permissions; remove them through the approved process before migration.`);
    for (const col of spec.columns) {
      const found = columns.find((c) => c.key === col.key);
      if (!compatible(found, col)) throw new Error(`Existing column ${spec.id}.${col.key} is incompatible; no changes applied.`);
    }
    for (const index of spec.indexes) {
      const found = indexes.find((i) => i.key === index.key);
      if (found && (found.type !== index.type || JSON.stringify(found.columns) !== JSON.stringify(index.columns))) throw new Error(`Existing index ${spec.id}.${index.key} is incompatible; no changes applied.`);
    }
  }
  inspected.push({ spec, table, columns, indexes });
}

let bucket = null;
try { bucket = await storage.getBucket(bucketId); } catch (error) { if (error?.code !== 404) throw new Error('Could not inspect media bucket; migration stopped safely.'); }

// ---- Build plan ----
const plan = [];
for (const col of platformSettingsAdds) if (!platformCols.some((c) => c.key === col.key)) plan.push(`platform_settings: add optional column ${col.key}.`);
for (const { spec, table, columns, indexes } of inspected) {
  if (!table) plan.push(`Create row-secured table ${spec.id} (no client permissions).`);
  for (const col of spec.columns) if (!columns.some((c) => c.key === col.key)) plan.push(`${spec.id}: add ${col.type} column ${col.key}.`);
  for (const index of spec.indexes) if (!indexes.some((i) => i.key === index.key)) plan.push(`${spec.id}: add ${index.type} index ${index.key} (${index.columns.join(', ')}).`);
}
if (!bucket) plan.push(`Create private Storage bucket ${bucketId} (file security, 10 MB limit, no client permissions).`);

console.log(`Appwrite admin-features migration target: ${env} / ${projectId} / ${databaseId}`);
console.log(plan.length ? plan.map((line) => `- ${line}`).join('\n') : 'Schema is already complete and compatible.');
if (dryRun || plan.length === 0) { console.log('Dry run only; no schema changes applied.'); process.exit(0); }

const readline = createInterface({ input: stdin, output: stdout });
try {
  const phrase = `APPLY ADMIN FEATURES MIGRATION IN ${env} PROJECT ${projectId}`;
  const answer = await readline.question(`Type "${phrase}" to continue: `);
  if (answer !== phrase) throw new Error('Confirmation did not match; no schema changes applied.');
} finally { readline.close(); }

try {
  for (const col of platformSettingsAdds) if (!platformCols.some((c) => c.key === col.key)) await createColumn('platform_settings', col);

  for (const { spec, table, columns, indexes } of inspected) {
    if (!table) {
      await tables.createTable(databaseId, spec.id, spec.name, [], true);
      await waitForAvailable(() => tables.getTable(databaseId, spec.id), `Table ${spec.id}`);
    }
    for (const col of spec.columns) if (!columns.some((c) => c.key === col.key)) await createColumn(spec.id, col);
    for (const index of spec.indexes) {
      if (indexes.some((i) => i.key === index.key)) continue;
      await tables.createIndex(databaseId, spec.id, index.key, index.type, index.columns, index.orders);
      await waitForAvailable(() => tables.getIndex(databaseId, spec.id, index.key), `Index ${spec.id}.${index.key}`);
    }
    console.log(`Table ${spec.id} is complete.`);
  }

  if (!bucket) {
    await storage.createBucket(bucketId, 'DrawSpace Media', [], true, true, 10_485_760, [], undefined, true, true);
    console.log(`Created private Storage bucket ${bucketId}.`);
  }
  console.log('Admin-features migration applied. Re-run dry-run to confirm completeness.');
} catch (error) {
  console.error('Migration stopped after a schema operation failed. Re-run in dry-run mode to inspect partial progress; operations are idempotent.');
  throw error;
}