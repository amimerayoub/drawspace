import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Client, TablesDB } from 'node-appwrite';

// Additive, idempotent media optimization migration. Dry-run by default.
// Adds optional metadata columns to media_assets so optimized uploads can record
// dimensions, transparency and responsive widths. Uploads work without these
// columns (variants are stored under deterministic file ids); the columns only
// enrich the media library view. Existing rows are untouched. Never prints secrets.

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = args.has('--dry-run') || !apply;
const env = process.env.APPWRITE_ENV;
if (!env || !['development', 'staging'].includes(env)) throw new Error('Set APPWRITE_ENV explicitly to development or staging. This script refuses production.');
const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.DATABASE_ID || 'drawspace_db';
if (!endpoint || !projectId || !apiKey) throw new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY are required. Values are never printed.');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tables = new TablesDB(client);

const waitForAvailable = async (read, label) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const resource = await read();
    if (resource.status === 'available') return;
    if (['failed', 'stuck', 'deleting'].includes(resource.status)) throw new Error(`${label} entered ${resource.status}; migration stopped safely.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become available within 60 seconds; migration stopped safely.`);
};

// [key, type, size, required, default]
const adds = [
  ['width', 'integer', 0, false, 0],
  ['height', 'integer', 0, false, 0],
  ['hasAlpha', 'boolean', 0, false, false],
  ['optimized', 'boolean', 0, false, false],
  ['originalMime', 'string', 64, false, ''],
  ['widths', 'string', 255, false, ''],
];

const getTable = async (id) => { try { return await tables.getTable(databaseId, id); } catch (error) { if (error?.code === 404) return null; throw error; } };
const mediaAssets = await getTable('media_assets');
if (!mediaAssets) throw new Error('Expected the media_assets table to exist; inspect manually. No changes applied.');
const columns = (await tables.listColumns(databaseId, 'media_assets', [])).columns;

const plan = adds.filter(([key]) => !columns.some((c) => c.key === key)).map(([key, type]) => `media_assets: add optional column ${key} (${type}).`);
console.log(`Appwrite media optimization migration target: ${env} / ${databaseId}`);
console.log(plan.length ? plan.map((line) => `- ${line}`).join('\n') : 'Schema is already complete and compatible.');
if (dryRun || plan.length === 0) { console.log('Dry run only; no schema changes applied.'); process.exit(0); }

const readline = createInterface({ input: stdin, output: stdout });
try {
  const phrase = `APPLY MEDIA OPTIMIZATION MIGRATION IN ${env} PROJECT ${projectId}`;
  const answer = await readline.question(`Type "${phrase}" to continue: `);
  if (answer !== phrase) throw new Error('Confirmation did not match; no schema changes applied.');
} finally { readline.close(); }

try {
  for (const [key, type, size, required, def] of adds) {
    if (columns.some((c) => c.key === key)) continue;
    if (type === 'integer') await tables.createIntegerColumn(databaseId, 'media_assets', key, required, def ?? 0, size || undefined);
    else if (type === 'boolean') await tables.createBooleanColumn(databaseId, 'media_assets', key, required, def ?? false);
    else await tables.createStringColumn(databaseId, 'media_assets', key, size, required, def ?? '', false);
    await waitForAvailable(() => tables.getColumn(databaseId, 'media_assets', key), `Column media_assets.${key}`);
    console.log(`Added column media_assets.${key}.`);
  }
  console.log('Media optimization migration applied. Re-run dry-run to confirm completeness.');
} catch (error) {
  console.error('Migration stopped after a schema operation failed. Re-run dry-run to inspect partial progress; operations are idempotent.');
  throw error;
}