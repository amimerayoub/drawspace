import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { WordRepository, invalidateWords } from './wordRepository';

class FakeWordsTable {
  rows: Array<Record<string, unknown> & { $id: string }> = [];
  calls: string[][] = [];
  fail = false;
  delayMs = 0;

  async listRows(_databaseId: string, tableId: string, queries: string[] = []) {
    assert.equal(tableId, 'custom_words');
    this.calls.push(queries);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.fail) throw new Error('appwrite unavailable');
    let rows = [...this.rows];
    let limit = 25;
    let cursor: string | undefined;
    let select: string[] | null = null;
    for (const encoded of queries) {
      const query = JSON.parse(encoded) as { method: string; attribute?: string; values?: unknown[] };
      if (query.method === 'equal' && query.attribute) rows = rows.filter((row) => query.values?.includes(row[query.attribute!]));
      if (query.method === 'limit') limit = Number(query.values?.[0]);
      if (query.method === 'cursorAfter') cursor = String(query.values?.[0]);
      if (query.method === 'select') select = query.values as string[];
    }
    if (cursor) {
      const index = rows.findIndex((row) => row.$id === cursor);
      rows = index >= 0 ? rows.slice(index + 1) : [];
    }
    const page = rows.slice(0, limit);
    // TablesDB keeps system metadata even when select trims user attributes.
    return { rows: page.map((row) => (select ? Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('$') || select!.includes(key))) : structuredClone(row))), total: rows.length };
  }
}

const asDatabase = (table: FakeWordsTable) => ({ tables: table, databaseId: 'words_test' }) as unknown as AppwriteDatabase;

const seed = (table: FakeWordsTable, count: number, overrides: Record<string, unknown> = {}) => {
  for (let index = 0; index < count; index += 1) {
    table.rows.push({ $id: `row_${table.rows.length}`, id: `w_${table.rows.length}`, word: `word${table.rows.length}`, category: 'Animals', difficulty: 'easy', language: 'en', isActive: true, hint: 'secret hint', ...overrides });
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('words cache loads once with select + cursorAfter paging and serves repeats from memory', async () => {
  const table = new FakeWordsTable();
  seed(table, 250);
  const repository = new WordRepository(asDatabase(table));
  const first = await repository.active();
  const second = await repository.active('all');
  const third = await repository.active('mixed');
  assert.equal(first.length, 250);
  assert.equal(second.length, 250);
  assert.equal(third.length, 250);
  assert.equal(table.calls.length, 3);
  for (const call of table.calls) {
    const methods = call.map((encoded) => (JSON.parse(encoded) as { method: string }).method);
    assert.ok(methods.includes('select'));
    assert.ok(methods.includes('equal'));
    assert.ok(methods.includes('limit'));
  }
  assert.ok(table.calls[1].some((encoded) => (JSON.parse(encoded) as { method: string }).method === 'cursorAfter'));
  assert.ok(table.calls[2].some((encoded) => (JSON.parse(encoded) as { method: string }).method === 'cursorAfter'));
  assert.deepEqual(Object.keys(first[0]).sort(), ['category', 'difficulty', 'id', 'word']);
});

test('words cache filters inactive and unplayable words and groups by language and difficulty', async () => {
  const table = new FakeWordsTable();
  seed(table, 2, { difficulty: 'easy', language: 'en' });
  seed(table, 2, { difficulty: 'hard', language: 'fr' });
  seed(table, 1, { difficulty: 'medium', language: 'en' });
  seed(table, 1, { isActive: false });
  seed(table, 1, { word: '!!!' });
  const repository = new WordRepository(asDatabase(table));
  assert.equal((await repository.active()).length, 5);
  const easy = await repository.active('easy');
  assert.equal(easy.length, 2);
  assert.ok(easy.every((word) => word.difficulty === 'easy'));
  const hard = await repository.active('hard');
  assert.equal(hard.length, 2);
  assert.equal((await repository.active('medium')).length, 1);
  assert.equal(table.calls.length, 1);
});

test('words cache shares one in-flight load between concurrent callers', async () => {
  const table = new FakeWordsTable();
  seed(table, 5);
  table.delayMs = 20;
  const repository = new WordRepository(asDatabase(table));
  const [a, b] = await Promise.all([repository.active(), repository.active('easy')]);
  assert.equal(a.length, 5);
  assert.equal(b.length, 5);
  assert.equal(table.calls.length, 1);
});

test('words cache reloads after TTL and serves stale data when a refresh fails', async () => {
  const table = new FakeWordsTable();
  seed(table, 3);
  const repository = new WordRepository(asDatabase(table), 30);
  assert.equal((await repository.active()).length, 3);
  await sleep(40);
  seed(table, 1);
  assert.equal((await repository.active()).length, 4);
  assert.equal(table.calls.length, 2);
  table.fail = true;
  await sleep(40);
  assert.equal((await repository.active()).length, 4);
  table.fail = false;
  seed(table, 1);
  assert.equal((await repository.active()).length, 5);
  assert.equal(table.calls.length, 4);
});

test('invalidateWords forces a reload and wins over a load already in flight', async () => {
  const table = new FakeWordsTable();
  seed(table, 2);
  const repository = new WordRepository(asDatabase(table));
  assert.equal((await repository.active()).length, 2);
  seed(table, 1);
  invalidateWords();
  assert.equal((await repository.active()).length, 3);
  assert.equal(table.calls.length, 2);

  table.delayMs = 30;
  invalidateWords();
  const pending = repository.active();
  await sleep(5);
  seed(table, 1);
  invalidateWords();
  const result = await pending;
  assert.equal(result.length, 4);
  assert.equal(table.calls.length, 4);
});

test('words cache survives backends that ignore cursorAfter without duplicating rows', async () => {
  const table = new FakeWordsTable();
  seed(table, 150);
  const ignoring = new FakeWordsTable();
  ignoring.rows = table.rows;
  const original = ignoring.listRows.bind(ignoring);
  ignoring.listRows = async (databaseId: string, tableId: string, queries: string[] = []) => original(databaseId, tableId, queries.filter((encoded) => (JSON.parse(encoded) as { method: string }).method !== 'cursorAfter'));
  const repository = new WordRepository(asDatabase(ignoring));
  const words = await repository.active();
  assert.equal(words.length, 100);
  assert.equal(new Set(words.map((word) => word.id)).size, 100);
  assert.equal(ignoring.calls.length, 2);
});

test('Query helpers used by the cache encode select and cursorAfter', () => {
  assert.deepEqual(JSON.parse(Query.select(['$id', 'word'])), { method: 'select', values: ['$id', 'word'] });
  assert.deepEqual(JSON.parse(Query.cursorAfter('row_9')), { method: 'cursorAfter', values: ['row_9'] });
});