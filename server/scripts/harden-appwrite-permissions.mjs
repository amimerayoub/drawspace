import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Query, TablesDB } from 'node-appwrite';

const endpoint = process.env.APPWRITE_TEST_ENDPOINT;
const projectId = process.env.APPWRITE_TEST_PROJECT_ID;
const databaseId = process.env.APPWRITE_TEST_DATABASE_ID;
const apiKey = process.env.APPWRITE_TEST_API_KEY;
const expected = { endpoint: 'https://fra.cloud.appwrite.io/v1', databaseId: 'drawspace_db' };
if (endpoint !== expected.endpoint || !projectId || databaseId !== expected.databaseId || !apiKey) {
  throw new Error('Permission tool target guard failed; expected the configured DrawSpace test project/database. No request was sent.');
}

const args = process.argv.slice(2);
const mode = args.includes('--rollback') ? 'rollback' : args.includes('--apply') ? 'apply' : 'dry-run';
const allowedArgs = new Set(['--dry-run', '--apply', '--rollback', '--backup-file']);
for (const arg of args.filter((item) => item.startsWith('--'))) {
  if (!allowedArgs.has(arg)) throw new Error(`Unknown option ${arg}.`);
}
if (args.includes('--apply') && args.includes('--rollback')) throw new Error('Choose apply or rollback, not both.');
if (args.includes('--dry-run') && mode !== 'dry-run') throw new Error('Choose dry-run, apply, or rollback.');
const backupIndex = args.indexOf('--backup-file');
const backupPath = backupIndex >= 0 ? args[backupIndex + 1] : process.env.APPWRITE_PERMISSION_BACKUP_PATH;
if (mode === 'rollback' && !backupPath) throw new Error('Rollback requires --backup-file <secure-path>.');
if (mode === 'apply' && !backupPath) throw new Error('Apply requires APPWRITE_PERMISSION_BACKUP_PATH outside the repository.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = path.join(root, 'docs', 'APPWRITE_PERMISSION_BASELINE.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
if (baseline.endpoint !== endpoint || baseline.databaseId !== databaseId || baseline.total !== baseline.tables.length) {
  throw new Error('Permission baseline target or integrity mismatch; no changes applied.');
}
const baselineById = new Map(baseline.tables.map((table) => [table.id, table]));
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tables = new TablesDB(client);
const ownerFields = { profiles: 'userId', user_preferences: 'userId', user_statistics: 'userId', guest_sessions: 'guestUserId' };
const canonical = (value) => JSON.stringify(value);
const sorted = (values) => [...values].sort();
const normalizeOwner = (permission) => permission.replace(/(user|team):[^\")]+/g, '$1:<owner>');
const normalizeColumn = (column) => ({
  key: column.key,
  type: column.type,
  required: Boolean(column.required),
  array: Boolean(column.array),
  ...(column.size !== undefined ? { size: Number(column.size) } : {}),
  ...(column.min !== undefined ? { min: String(column.min) } : {}),
  ...(column.max !== undefined ? { max: String(column.max) } : {}),
});
const normalizeIndex = (index) => ({ key: index.key, type: index.type, columns: index.columns, orders: index.orders });

async function inspectLive() {
  const inventory = await tables.listTables(databaseId, [Query.limit(100)]);
  const liveIds = inventory.tables.map((table) => table.$id).sort();
  const expectedIds = [...baselineById.keys()].sort();
  if (inventory.total !== baseline.total || canonical(liveIds) !== canonical(expectedIds)) {
    throw new Error('Unexpected Appwrite table set; inspect manually. No changes applied.');
  }

  const result = [];
  for (const table of inventory.tables) {
    const base = baselineById.get(table.$id);
    const liveSchema = {
      name: table.name,
      enabled: Boolean(table.enabled),
      columns: table.columns.map(normalizeColumn).sort((a, b) => String(a.key).localeCompare(String(b.key))),
      indexes: table.indexes.map(normalizeIndex).sort((a, b) => a.key.localeCompare(b.key)),
    };
    const baseSchema = { name: base.name, enabled: Boolean(base.enabled), columns: base.columns, indexes: base.indexes };
    if (canonical(liveSchema) !== canonical(baseSchema)) throw new Error(`Schema drift detected in ${table.$id}; inspect manually. No changes applied.`);

    const rows = [];
    const ownerField = ownerFields[table.$id];
    let offset = 0;
    let total = 0;
    do {
      const select = ['$id', '$permissions', ...(ownerField ? [ownerField] : [])];
      const page = await tables.listRows(databaseId, table.$id, [Query.select(select), Query.limit(100), Query.offset(offset)]);
      total = page.total;
      for (const row of page.rows) {
        const permissions = sorted(row.$permissions || []);
        const template = sorted(permissions.map(normalizeOwner));
        const allowedTemplates = (base.rowPermissionTemplates || []).map((value) => sorted(value));
        if (permissions.length && !allowedTemplates.some((value) => canonical(value) === canonical(template))) {
          throw new Error(`Unexpected row permission state in ${table.$id}; inspect manually. No changes applied.`);
        }
        for (const permission of permissions) {
          const match = permission.match(/^(?:read|update|delete)\("user:([^\"]+)"\)$/);
          if (match && ownerField && String(row[ownerField] ?? '') !== match[1]) {
            throw new Error(`Row owner permission does not match ${table.$id} owner field; no changes applied.`);
          }
        }
        rows.push({ id: row.$id, permissions });
      }
      offset += page.rows.length;
      if (!page.rows.length) break;
      if (offset > 10_000) throw new Error(`Row-permission inspection exceeded the 10,000-row safety cap for ${table.$id}. No changes applied.`);
    } while (offset < total);
    result.push({
      id: table.$id,
      name: table.name,
      enabled: Boolean(table.enabled),
      currentPermissions: sorted(table.$permissions || []),
      currentRowSecurity: Boolean(table.rowSecurity),
      rows,
    });
  }
  return result;
}

function isBaselineState(live) {
  return live.every((table) => {
    const base = baselineById.get(table.id);
    return table.currentRowSecurity === Boolean(base.rowSecurity)
      && canonical(table.currentPermissions) === canonical(sorted(base.permissions))
      && table.rows.every((row) => (base.rowPermissionTemplates || []).some((template) => canonical(sorted(template)) === canonical(sorted(row.permissions.map(normalizeOwner)))) || row.permissions.length === 0);
  });
}

function isHardenedState(live) {
  return live.every((table) => table.currentRowSecurity && table.currentPermissions.length === 0 && table.rows.every((row) => row.permissions.length === 0));
}

function printPlan(live) {
  console.log(`Verified target: ${endpoint} / ${projectId} / ${databaseId}`);
  console.log(`Schema verified: ${live.length} known tables; no unknown IDs or schema drift.`);
  for (const table of live) {
    const rowsToClear = table.rows.filter((row) => row.permissions.length).length;
    console.log(`- ${table.id}: table permissions ${JSON.stringify(table.currentPermissions)} -> []; rowSecurity ${table.currentRowSecurity} -> true; clear row grants on ${rowsToClear}/${table.rows.length} rows.`);
  }
}

async function confirm(phrase) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`Type exactly: ${phrase}\n> `);
    if (answer !== phrase) throw new Error('Confirmation did not match; no changes applied.');
  } finally { rl.close(); }
}

async function writeBackup(live) {
  const absolute = path.resolve(backupPath);
  const relative = path.relative(root, absolute);
  if (!path.isAbsolute(backupPath) || (!relative.startsWith('..') && relative !== '..')) {
    throw new Error('Backup path must be absolute and outside the repository.');
  }
  if (fs.existsSync(absolute)) throw new Error('Backup path already exists; refusing to overwrite it.');
  if (!fs.existsSync(path.dirname(absolute))) throw new Error('Backup directory must already exist and be access-controlled.');
  const snapshot = {
    createdAt: new Date().toISOString(), endpoint, projectId, databaseId,
    tables: live.map((table) => ({ id: table.id, permissions: table.currentPermissions, rowSecurity: table.currentRowSecurity, rows: table.rows.map((row) => ({ id: row.id, permissions: row.permissions })) })),
  };
  fs.writeFileSync(absolute, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return absolute;
}

async function apply(live) {
  const phrase = `APPLY APPWRITE PERMISSION HARDENING TO PROJECT ${projectId} DATABASE ${databaseId}`;
  await confirm(phrase);
  const savedPath = await writeBackup(live);
  console.log(`Permission backup written outside repository: ${savedPath}`);
  try {
    for (const table of live) {
      await tables.updateTable({ databaseId, tableId: table.id, name: table.name, permissions: [], rowSecurity: true, enabled: table.enabled, purge: true });
      for (const row of table.rows) if (row.permissions.length) await tables.updateRow(databaseId, table.id, row.id, {}, []);
    }
    const verified = await inspectLive();
    if (!isHardenedState(verified)) throw new Error('Post-apply verification did not reach the expected deny-by-default state.');
    console.log('Permission hardening completed and verified. No rows were deleted or application columns modified.');
  } catch (error) {
    console.error(`Apply stopped after a permission operation failed. Restore with --rollback --backup-file "${savedPath}" after reviewing the partial state.`);
    throw error;
  }
}

async function rollback(live) {
  const absolute = path.resolve(backupPath);
  const saved = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (saved.endpoint !== endpoint || saved.projectId !== projectId || saved.databaseId !== databaseId) throw new Error('Rollback backup target mismatch; no changes applied.');
  if (canonical(saved.tables.map((table) => table.id).sort()) !== canonical([...baselineById.keys()].sort())) throw new Error('Rollback backup table set mismatch; no changes applied.');
  const byId = new Map(live.map((table) => [table.id, table]));
  for (const savedTable of saved.tables) {
    const current = byId.get(savedTable.id);
    if (!current) throw new Error(`Rollback table ${savedTable.id} is missing; no changes applied.`);
    const base = baselineById.get(savedTable.id);
    const baselineTable = current.currentRowSecurity === Boolean(base.rowSecurity) && canonical(current.currentPermissions) === canonical(sorted(base.permissions));
    const hardenedTable = current.currentRowSecurity && current.currentPermissions.length === 0;
    if (!baselineTable && !hardenedTable) throw new Error(`Unexpected current permissions for ${savedTable.id}; refusing rollback.`);
    const liveRows = new Map(current.rows.map((row) => [row.id, row]));
    for (const row of savedTable.rows) {
      const found = liveRows.get(row.id);
      if (!found) throw new Error(`A backed-up row in ${savedTable.id} is missing; no changes applied.`);
      const known = found.permissions.length === 0 || canonical(sorted(found.permissions)) === canonical(sorted(row.permissions));
      if (!known) throw new Error(`Unexpected current row permissions in ${savedTable.id}; refusing rollback.`);
    }
  }

  await confirm(`ROLLBACK APPWRITE PERMISSIONS FOR PROJECT ${projectId} DATABASE ${databaseId}`);
  try {
    for (const savedTable of saved.tables) {
      for (const row of savedTable.rows) {
        const current = byId.get(savedTable.id).rows.find((item) => item.id === row.id);
        if (canonical(sorted(current.permissions)) !== canonical(sorted(row.permissions))) await tables.updateRow(databaseId, savedTable.id, row.id, {}, row.permissions);
      }
    }
    for (const savedTable of saved.tables) {
      const base = baselineById.get(savedTable.id);
      await tables.updateTable({ databaseId, tableId: savedTable.id, name: base.name, permissions: savedTable.permissions, rowSecurity: savedTable.rowSecurity, enabled: base.enabled, purge: true });
    }
    console.log('Original table and captured row permissions restored. No rows were deleted.');
  } catch (error) {
    console.error('Rollback stopped after a permission operation failed; retain the backup and inspect the target before retrying.');
    throw error;
  }
}

const live = await inspectLive();
if (mode !== 'rollback' && isHardenedState(live)) {
  console.log('All known tables are already deny-by-default; no changes needed.');
  process.exit(0);
}
if (mode === 'rollback') {
  await rollback(live);
} else {
  if (!isBaselineState(live)) throw new Error('Unexpected or partially changed permission state; refusing to mutate. Restore from an approved backup or refresh the reviewed baseline.');
  printPlan(live);
  if (mode === 'dry-run') console.log('Dry run only. No Appwrite permissions or records changed.');
  else await apply(live);
}
