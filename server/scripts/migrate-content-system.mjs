import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Client, Query, TablesDB } from 'node-appwrite';

// Additive, idempotent content-system migration. Dry-run by default.
// See docs/CONTENT_SCHEMA_MIGRATION_PROPOSAL.md. Never prints secrets.

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

const getTable = async (id) => { try { return await tables.getTable(databaseId, id); } catch (error) { if (error?.code === 404) return null; throw error; } };
const columnsOf = async (id) => (await tables.listColumns(databaseId, id, [])).columns;
const indexesOf = async (id) => (await tables.listIndexes(databaseId, id, [])).indexes;

// [key, type, size, required, default, array]
const blogPostAdds = [['tags', 'string', 32, false, [], true]];
const wordAdds = [
  ['language', 'string', 8, false, 'en', false],
  ['hint', 'string', 255, false, '', false],
  ['normalizedWord', 'string', 64, false, '', false],
  ['createdAt', 'string', 64, false, '', false],
  ['updatedAt', 'string', 64, false, '', false],
];
const wordCategoriesTable = {
  id: 'word_categories', name: 'Word Categories',
  columns: [['id', 'string', 32, true], ['name', 'string', 64, true], ['slug', 'string', 64, true], ['description', 'string', 255, false, ''], ['isActive', 'boolean', 0, false, true], ['sortOrder', 'integer', 0, false, 0, 0, 1000]],
  indexes: [{ key: 'idx_slug', type: 'unique', columns: ['slug'] }],
};
const mcpKeysTable = {
  id: 'mcp_api_keys', name: 'MCP API Keys',
  columns: [['id', 'string', 64, true], ['name', 'string', 64, true], ['keyHash', 'string', 128, true], ['keyPrefix', 'string', 16, true], ['scopes', 'string', 32, false, [], true], ['status', 'string', 16, false, 'active'], ['createdBy', 'string', 36, true], ['createdAt', 'string', 64, true], ['expiresAt', 'string', 64, false, ''], ['lastUsedAt', 'string', 64, false, ''], ['revokedAt', 'string', 64, false, '']],
  indexes: [{ key: 'idx_keyHash', type: 'unique', columns: ['keyHash'] }, { key: 'idx_status', type: 'key', columns: ['status'] }],
};

const createColumn = async (tableId, [key, type, size, required, def, array]) => {
  if (type === 'string') await tables.createStringColumn(databaseId, tableId, key, size, required, def ?? '', Boolean(array));
  else if (type === 'integer') await tables.createIntegerColumn(databaseId, tableId, key, required, def ?? 0, size /* max */);
  else await tables.createBooleanColumn(databaseId, tableId, key, required, def ?? false);
  await waitForAvailable(() => tables.getColumn(databaseId, tableId, key), `Column ${tableId}.${key}`);
};

// ---- Inspect live state ----
const blogPosts = await getTable('blog_posts');
const customWords = await getTable('custom_words');
if (!blogPosts || !customWords) throw new Error('Expected blog_posts and custom_words tables to exist; inspect manually. No changes applied.');
const blogCols = await columnsOf('blog_posts');
const wordCols = await columnsOf('custom_words');
const wordIdx = await indexesOf('custom_words');
const wordCategories = await getTable('word_categories');
const mcpKeys = await getTable('mcp_api_keys');

const plan = [];
for (const [key] of blogPostAdds) if (!blogCols.some((c) => c.key === key)) plan.push(`blog_posts: add column ${key}.`);
for (const [key] of wordAdds) if (!wordCols.some((c) => c.key === key)) plan.push(`custom_words: add column ${key}.`);

// Backfill + collision detection for normalizedWord.
const allWords = [];
{ let offset = 0; for (;;) { const page = await tables.listRows(databaseId, 'custom_words', [Query.limit(100), Query.offset(offset)]); allWords.push(...page.rows); if (page.rows.length < 100) break; offset += 100; } }
const needsBackfill = allWords.filter((row) => !String(row.normalizedWord || '').trim());
const normalizedMap = new Map();
for (const row of allWords) {
  const norm = String(row.normalizedWord || '').trim() || String(row.word || '').trim().toLowerCase();
  if (!norm) continue;
  normalizedMap.set(norm, (normalizedMap.get(norm) || 0) + 1);
}
const collisions = [...normalizedMap.entries()].filter(([, count]) => count > 1).map(([norm]) => norm);
const hasNormalizedIndex = wordIdx.some((i) => i.key === 'idx_normalizedWord');
if (needsBackfill.length) plan.push(`custom_words: backfill normalizedWord on ${needsBackfill.length} row(s).`);
if (!hasNormalizedIndex) plan.push(collisions.length ? `custom_words: SKIP unique idx_normalizedWord (case-insensitive duplicates exist: ${collisions.slice(0, 10).join(', ')}${collisions.length > 10 ? ', …' : ''}). Resolve manually first.` : 'custom_words: add unique index idx_normalizedWord.');
if (!wordCategories) plan.push('Create row-secured table word_categories (no client permissions) + idx_slug.');
if (!mcpKeys) plan.push('Create row-secured table mcp_api_keys (no client permissions) + idx_keyHash, idx_status.');

console.log(`Appwrite content migration target: ${env} / ${projectId} / ${databaseId}`);
console.log(`Live rows: custom_words=${allWords.length}, normalizedWord backfill needed=${needsBackfill.length}, case-insensitive collisions=${collisions.length}.`);
console.log(plan.length ? plan.map((line) => `- ${line}`).join('\n') : 'Schema is already complete and compatible.');
if (dryRun || plan.length === 0) { console.log('Dry run only; no schema changes applied.'); process.exit(0); }

const readline = createInterface({ input: stdin, output: stdout });
try {
  const phrase = `APPLY CONTENT MIGRATION IN ${env} PROJECT ${projectId}`;
  const answer = await readline.question(`Type "${phrase}" to continue: `);
  if (answer !== phrase) throw new Error('Confirmation did not match; no schema changes applied.');
} finally { readline.close(); }

try {
  for (const spec of blogPostAdds) if (!blogCols.some((c) => c.key === spec[0])) await createColumn('blog_posts', spec);
  for (const spec of wordAdds) if (!wordCols.some((c) => c.key === spec[0])) await createColumn('custom_words', spec);

  if (needsBackfill.length) {
    const now = new Date().toISOString();
    for (const row of needsBackfill) {
      const norm = String(row.word || '').trim().toLowerCase();
      await tables.updateRow(databaseId, 'custom_words', row.$id, { normalizedWord: norm, ...(row.createdAt ? {} : { createdAt: now }), updatedAt: now });
    }
    console.log(`Backfilled normalizedWord on ${needsBackfill.length} row(s).`);
  }
  if (!hasNormalizedIndex && collisions.length === 0) {
    await tables.createIndex(databaseId, 'custom_words', 'idx_normalizedWord', 'unique', ['normalizedWord']);
    await waitForAvailable(() => tables.getIndex(databaseId, 'custom_words', 'idx_normalizedWord'), 'Index idx_normalizedWord');
  }

  for (const spec of [wordCategoriesTable, mcpKeysTable]) {
    if (await getTable(spec.id)) continue;
    await tables.createTable(databaseId, spec.id, spec.name, [], true);
    await waitForAvailable(() => tables.getTable(databaseId, spec.id), `Table ${spec.id}`);
    for (const column of spec.columns) await createColumn(spec.id, column);
    for (const index of spec.indexes) {
      await tables.createIndex(databaseId, spec.id, index.key, index.type, index.columns, index.orders);
      await waitForAvailable(() => tables.getIndex(databaseId, spec.id, index.key), `Index ${spec.id}.${index.key}`);
    }
    console.log(`Created table ${spec.id}.`);
  }
  console.log('Content-system migration applied. Re-run dry-run to confirm completeness.');
} catch (error) {
  console.error('Migration stopped after a schema operation failed. Re-run dry-run to inspect partial progress; operations are idempotent.');
  throw error;
}