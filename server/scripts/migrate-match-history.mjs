import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Client, TablesDB } from 'node-appwrite';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = args.has('--dry-run') || !apply;
const env = process.env.APPWRITE_ENV;
if (!env || !['development', 'staging', 'production'].includes(env)) throw new Error('Set APPWRITE_ENV explicitly to development, staging, or production.');
if (env === 'production') throw new Error('This script refuses production. Use the approved production migration process.');
const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.DATABASE_ID || 'drawspace_db';
if (!endpoint || !projectId || !apiKey) throw new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY are required. Values are never printed.');

const schema = [
  ['matchId', 'string', 64, true], ['roomId', 'string', 36, true], ['roomCode', 'string', 6, true], ['roomName', 'string', 64, true],
  ['status', 'string', 16, true], ['startedAt', 'string', 32, true], ['completedAt', 'string', 32, true], ['durationSeconds', 'integer', 0, true, 0, 86400],
  ['playerId', 'string', 36, true], ['username', 'string', 32, true], ['avatarId', 'string', 32, true], ['accountType', 'string', 16, true],
  ['score', 'integer', 0, true, 0, 2147483647], ['placement', 'integer', 0, true, 1, 32], ['isWinner', 'boolean', 0, true], ['playerCount', 'integer', 0, true, 1, 32],
  ['roundsConfigured', 'integer', 0, true, 1, 10], ['roundsCompleted', 'integer', 0, true, 0, 320], ['configuration', 'string', 2048, true],
];
const indexes = [
  { key: 'match_player_unique', type: 'unique', columns: ['matchId', 'playerId'] },
  { key: 'player_completed', type: 'key', columns: ['playerId', 'completedAt'], orders: ['asc', 'desc'] },
  { key: 'match_placement', type: 'key', columns: ['matchId', 'placement'], orders: ['asc', 'asc'] },
];
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tables = new TablesDB(client);
const tableId = 'match_history';
const waitForAvailable = async (read, label) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const resource = await read();
    if (resource.status === 'available') return;
    if (resource.status === 'failed' || resource.status === 'stuck' || resource.status === 'deleting') throw new Error(`${label} entered ${resource.status}; migration stopped safely.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become available within 60 seconds; migration stopped safely.`);
};
let table;
try { table = await tables.getTable(databaseId, tableId); } catch (error) { if (error?.code !== 404) throw new Error('Could not inspect target table; migration stopped safely.'); }
let columns = [];
let existingIndexes = [];
if (table) {
  columns = (await tables.listColumns(databaseId, tableId, [])).columns;
  existingIndexes = (await tables.listIndexes(databaseId, tableId, [])).indexes;
  for (const [key, type, size, required, min, max] of schema) {
    const found = columns.find((column) => column.key === key);
    if (found && (found.type !== type || Boolean(found.required) !== required || (type === 'string' && Number(found.size) < size) || (type === 'integer' && ((min !== undefined && Number(found.min) > min) || (max !== undefined && Number(found.max) < max))))) throw new Error(`Existing column ${key} is incompatible; no changes applied.`);
  }
  if (table.rowSecurity !== true) throw new Error('Existing table must have row security enabled; no changes applied.');
  if (Array.isArray(table.$permissions) && table.$permissions.length) throw new Error('Existing table has direct permissions; remove them through the approved process before migration.');
  for (const expected of indexes) {
    const found = existingIndexes.find((index) => index.key === expected.key);
    if (found && (found.type !== expected.type || JSON.stringify(found.columns) !== JSON.stringify(expected.columns) || (expected.orders && JSON.stringify(found.orders) !== JSON.stringify(expected.orders)))) throw new Error(`Existing index ${expected.key} is incompatible; no changes applied.`);
  }
}
const plan = [];
if (!table) plan.push('Create row-secured table match_history with no client permissions.');
for (const [key, type, size, , min, max] of schema) if (!columns.some((column) => column.key === key)) plan.push(`Create ${type}${type === 'string' ? `(${size})` : type === 'integer' ? `(${min}..${max})` : ''} required column ${key}.`);
for (const index of indexes) if (!existingIndexes.some((item) => item.key === index.key)) plan.push(`Create ${index.type} index ${index.key} (${index.columns.join(', ')}).`);
console.log(`Appwrite migration target: ${env} / ${projectId} / ${databaseId}`);
console.log(plan.length ? plan.map((line) => `- ${line}`).join('\n') : 'Schema is already complete and compatible.');
if (dryRun || plan.length === 0) { console.log('Dry run only; no schema changes applied.'); process.exit(0); }

const readline = createInterface({ input: stdin, output: stdout });
try {
  const answer = await readline.question(`Type CREATE match_history IN ${env} PROJECT ${projectId} to continue: `);
  if (answer !== `CREATE match_history IN ${env} PROJECT ${projectId}`) throw new Error('Confirmation did not match; no schema changes applied.');
} finally { readline.close(); }

try {
  if (!table) await tables.createTable(databaseId, tableId, 'Match history', [], true);
  for (const column of columns) await waitForAvailable(() => tables.getColumn(databaseId, tableId, column.key), `Existing column ${column.key}`);
  for (const index of existingIndexes) await waitForAvailable(() => tables.getIndex(databaseId, tableId, index.key), `Existing index ${index.key}`);
  for (const [key, type, size, required, min, max] of schema) {
    if (columns.some((column) => column.key === key)) continue;
    if (type === 'string') await tables.createStringColumn(databaseId, tableId, key, size, required);
    else if (type === 'integer') await tables.createIntegerColumn(databaseId, tableId, key, required, min, max);
    else await tables.createBooleanColumn(databaseId, tableId, key, required);
    await waitForAvailable(() => tables.getColumn(databaseId, tableId, key), `Column ${key}`);
  }
  for (const index of indexes) {
    if (existingIndexes.some((item) => item.key === index.key)) continue;
    await tables.createIndex(databaseId, tableId, index.key, index.type, index.columns, index.orders);
    await waitForAvailable(() => tables.getIndex(databaseId, tableId, index.key), `Index ${index.key}`);
  }
  console.log('Match-history migration applied.');
} catch (error) {
  console.error('Migration stopped after a schema operation failed. Re-run in dry-run mode to inspect partial progress; operations are idempotent.');
  throw error;
}
