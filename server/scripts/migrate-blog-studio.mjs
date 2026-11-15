import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Client, TablesDB } from 'node-appwrite';

// Additive, idempotent Blog Studio migration. Dry-run by default.
// Adds an optional studioDoc column to blog_posts and a blog_templates table.
// Existing posts are untouched: legacy plain-text content keeps working, and the
// studio falls back to storing documents in content until this migration runs.
// Never prints secrets.

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

// [key, type, size, required, default, array]
const blogPostAdds = [['studioDoc', 'mediumtext', 0, false, '', false]];
const blogTemplatesTable = {
  id: 'blog_templates', name: 'Blog Templates',
  columns: [
    ['id', 'string', 32, true],
    ['name', 'string', 64, true],
    ['description', 'string', 255, false, ''],
    ['doc', 'mediumtext', 0, true],
    ['createdBy', 'string', 64, false, ''],
    ['createdAt', 'string', 64, true],
  ],
  indexes: [],
};

const createColumn = async (tableId, [key, type, size, required, def, array]) => {
  if (type === 'mediumtext') await tables.createMediumtextColumn(databaseId, tableId, key, required, def ?? '', Boolean(array));
  else if (type === 'string') await tables.createStringColumn(databaseId, tableId, key, size, required, def ?? '', Boolean(array));
  else if (type === 'integer') await tables.createIntegerColumn(databaseId, tableId, key, required, def ?? 0, size);
  else await tables.createBooleanColumn(databaseId, tableId, key, required, def ?? false);
  await waitForAvailable(() => tables.getColumn(databaseId, tableId, key), `Column ${tableId}.${key}`);
};

// ---- Inspect live state ----
const blogPosts = await getTable('blog_posts');
if (!blogPosts) throw new Error('Expected the blog_posts table to exist; inspect manually. No changes applied.');
const blogCols = await columnsOf('blog_posts');
const blogTemplates = await getTable('blog_templates');

const plan = [];
for (const [key] of blogPostAdds) if (!blogCols.some((c) => c.key === key)) plan.push(`blog_posts: add column ${key} (mediumtext).`);
if (!blogTemplates) plan.push('Create row-secured table blog_templates (no client permissions).');

console.log(`Appwrite Blog Studio migration target: ${env} / ${projectId} / ${databaseId}`);
console.log(plan.length ? plan.map((line) => `- ${line}`).join('\n') : 'Schema is already complete and compatible.');
if (dryRun || plan.length === 0) { console.log('Dry run only; no schema changes applied.'); process.exit(0); }

const readline = createInterface({ input: stdin, output: stdout });
try {
  const phrase = `APPLY BLOG STUDIO MIGRATION IN ${env} PROJECT ${projectId}`;
  const answer = await readline.question(`Type "${phrase}" to continue: `);
  if (answer !== phrase) throw new Error('Confirmation did not match; no schema changes applied.');
} finally { readline.close(); }

try {
  for (const spec of blogPostAdds) if (!blogCols.some((c) => c.key === spec[0])) await createColumn('blog_posts', spec);

  if (!(await getTable(blogTemplatesTable.id))) {
    await tables.createTable(databaseId, blogTemplatesTable.id, blogTemplatesTable.name, [], true);
    await waitForAvailable(() => tables.getTable(databaseId, blogTemplatesTable.id), `Table ${blogTemplatesTable.id}`);
    for (const column of blogTemplatesTable.columns) await createColumn(blogTemplatesTable.id, column);
    for (const index of blogTemplatesTable.indexes) {
      await tables.createIndex(databaseId, blogTemplatesTable.id, index.key, index.type, index.columns, index.orders);
      await waitForAvailable(() => tables.getIndex(databaseId, blogTemplatesTable.id, index.key), `Index ${blogTemplatesTable.id}.${index.key}`);
    }
    console.log(`Created table ${blogTemplatesTable.id}.`);
  }
  console.log('Blog Studio migration applied. Re-run dry-run to confirm completeness.');
} catch (error) {
  console.error('Migration stopped after a schema operation failed. Re-run dry-run to inspect partial progress; operations are idempotent.');
  throw error;
}