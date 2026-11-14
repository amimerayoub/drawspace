import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../middleware/errors';
import { createContentDouble, testActor } from './contentTestDouble';
import { normalizeWord, WordService } from './wordService';

const word = (word: string, category = 'Animals', difficulty: 'easy' | 'medium' | 'hard' = 'easy') => ({ word, category, difficulty });

test('normalizeWord matches the game engine guess normalization', () => {
  assert.equal(normalizeWord('Café'), 'cafe');
  assert.equal(normalizeWord('ICE CREAM!'), 'icecream');
  assert.equal(normalizeWord('  Otter  '), 'otter');
});

test('word service creates words, detects normalized duplicates and audits', async () => {
  const { database, rows } = createContentDouble({ migrated: true });
  const service = new WordService(database);
  const created = await service.create(word('Café'), testActor);
  assert.equal(created.word, 'Café');
  assert.equal(created.language, 'en');
  assert.equal(created.active, true);
  assert.ok(created.createdAt);
  await assert.rejects(() => service.create(word('cafe'), testActor), (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'WORD_DUPLICATE');
  await assert.rejects(() => service.create(word('CAFÉ'), testActor), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal(rows.get('audit_logs')?.size, 1);
  const stored = [...rows.get('custom_words')!.values()][0];
  assert.equal(stored.normalizedWord, 'cafe');
});

test('word service rejects invalid input server-side', async () => {
  const { database } = createContentDouble();
  const service = new WordService(database);
  const invalid = [
    { ...word('x'), reason: 'too short' },
    { ...word(''), reason: 'empty' },
    { ...word('!!!'), reason: 'no alphanumerics' },
    { ...word('<script>'), reason: 'markup' },
    { ...word('ok', 'Animals', 'nightmare' as 'easy'), reason: 'difficulty' },
    { ...word('ok'), language: 'xx', reason: 'language' },
    { ...word('ok'), hint: '<b>x</b>', reason: 'hint markup' },
  ];
  for (const input of invalid) {
    await assert.rejects(() => service.create(input as never, testActor), (error: unknown) => error instanceof HttpError && error.status === 400, input.reason);
  }
});

test('word service updates and deletes with duplicate guard', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new WordService(database);
  const cat = await service.create(word('Cat'), testActor);
  await service.create(word('Dog'), testActor);
  const updated = await service.update(cat.id, { word: 'Kitten', difficulty: 'medium', hint: 'Says meow', active: false }, testActor);
  assert.equal(updated.word, 'Kitten');
  assert.equal(updated.difficulty, 'medium');
  assert.equal(updated.hint, 'Says meow');
  assert.equal(updated.active, false);
  await assert.rejects(() => service.update(cat.id, { word: 'dog' }, testActor), (error: unknown) => error instanceof HttpError && error.status === 409);
  await service.update(cat.id, { word: 'Kitten' }, testActor);
  await service.delete(cat.id, testActor);
  await assert.rejects(() => service.delete(cat.id, testActor), (error: unknown) => error instanceof HttpError && error.status === 404);
  assert.equal((await service.list()).total, 1);
});

test('word service lists with search, filters, sorting and cursor pagination', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new WordService(database);
  await service.create(word('Cat', 'Animals', 'easy'), testActor);
  await service.create(word('Elephant', 'Animals', 'medium'), testActor);
  await service.create(word('Mountain', 'Nature', 'hard'), testActor);
  await service.create(word('Apple', 'Food', 'easy'), testActor);
  const animals = await service.list({ category: 'animals' });
  assert.equal(animals.total, 2);
  const hard = await service.list({ difficulty: 'hard' });
  assert.deepEqual(hard.items.map((item) => item.word), ['Mountain']);
  const search = await service.list({ search: 'ele' });
  assert.deepEqual(search.items.map((item) => item.word), ['Elephant']);
  const pageOne = await service.list({ limit: 2, sort: 'word', order: 'asc' });
  assert.deepEqual(pageOne.items.map((item) => item.word), ['Apple', 'Cat']);
  assert.ok(pageOne.nextCursor);
  const pageTwo = await service.list({ limit: 2, sort: 'word', order: 'asc', cursor: pageOne.nextCursor! });
  assert.deepEqual(pageTwo.items.map((item) => item.word), ['Elephant', 'Mountain']);
  assert.equal(pageTwo.nextCursor, null);
  await assert.rejects(() => service.list({ cursor: 'bogus' }), (error: unknown) => error instanceof HttpError && error.code === 'INVALID_CURSOR');
  const inactive = await service.list({ active: false });
  assert.equal(inactive.total, 0);
});

test('word service computes real stats', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new WordService(database);
  await service.create(word('Cat', 'Animals', 'easy'), testActor);
  const dog = await service.create(word('Dog', 'Animals', 'medium'), testActor);
  await service.create(word('Mountain', 'Nature', 'hard'), testActor);
  await service.setActive([dog.id], false, testActor);
  const stats = await service.stats();
  assert.equal(stats.total, 3);
  assert.equal(stats.active, 2);
  assert.equal(stats.inactive, 1);
  assert.deepEqual(stats.byCategory, { Animals: 2, Nature: 1 });
  assert.deepEqual(stats.byDifficulty, { easy: 1, medium: 1, hard: 1 });
});

test('word service bulk create supports insert, skip and upsert strategies', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new WordService(database);
  await service.create(word('Cat'), testActor);
  const inputs = [word('cat'), word('Dog'), word('Dog'), word('x')];
  const insert = await service.bulkCreate(inputs, 'insert', testActor);
  assert.deepEqual(insert.results.map((result) => result.status), ['failed', 'created', 'failed', 'failed']);
  assert.equal(insert.created, 1);
  assert.equal(insert.failed, 3);
  const skip = await service.bulkCreate([word('CAT'), word('Bird')], 'skip', testActor);
  assert.deepEqual(skip.results.map((result) => result.status), ['skipped', 'created']);
  const upsert = await service.bulkCreate([{ ...word('Cat', 'Pets', 'hard') }], 'upsert', testActor);
  assert.equal(upsert.results[0].status, 'updated');
  const cat = (await service.list({ search: 'cat' })).items[0];
  assert.equal(cat.category, 'Pets');
  assert.equal(cat.difficulty, 'hard');
  await assert.rejects(() => service.bulkCreate([], 'skip', testActor), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test('word service bulk activation and deletion report per-id outcomes', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new WordService(database);
  const cat = await service.create(word('Cat'), testActor);
  const dog = await service.create(word('Dog'), testActor);
  const activation = await service.setActive([cat.id, 'missing'], false, testActor);
  assert.deepEqual(activation, { updated: [cat.id], notFound: ['missing'] });
  assert.equal((await service.list({ active: true })).total, 1);
  const deletion = await service.deleteMany([cat.id, dog.id, 'missing'], testActor);
  assert.deepEqual(deletion, { deleted: [cat.id, dog.id], notFound: ['missing'] });
  assert.equal((await service.list()).total, 0);
});

test('word service works before migration without optional columns', async () => {
  const { database, rows } = createContentDouble({ migrated: false });
  const service = new WordService(database);
  const created = await service.create({ ...word('Otter'), hint: 'River swimmer', language: 'en' }, testActor);
  assert.equal(created.hint, '');
  assert.equal(created.language, 'en');
  const stored = [...rows.get('custom_words')!.values()][0];
  assert.equal('hint' in stored, false);
  assert.equal('language' in stored, false);
  assert.equal('normalizedWord' in stored, false);
  await assert.rejects(() => service.create(word('otter'), testActor), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test('word categories derive from words before migration and block stored CRUD', async () => {
  const { database } = createContentDouble({ migrated: false });
  const service = new WordService(database);
  await service.create(word('Cat', 'Animals'), testActor);
  await service.create(word('Dog', 'Animals'), testActor);
  const categories = await service.listCategories();
  assert.deepEqual(categories, [{ id: 'animals', name: 'Animals', slug: 'animals', wordCount: 2 }]);
  await assert.rejects(() => service.createCategory('Food', testActor), (error: unknown) => error instanceof HttpError && error.code === 'MIGRATION_REQUIRED');
  const renamed = await service.renameCategory('animals', 'Pets', testActor);
  assert.equal(renamed.wordCount, 2);
  assert.equal((await service.list({ category: 'Pets' })).total, 2);
});

test('word categories support safe CRUD after migration', async () => {
  const { database } = createContentDouble({ migrated: true, withWordCategories: true });
  const service = new WordService(database);
  const food = await service.createCategory('Food', testActor);
  await assert.rejects(() => service.createCategory('food', testActor), (error: unknown) => error instanceof HttpError && error.status === 409);
  await service.create(word('Apple', 'Food'), testActor);
  await service.create(word('Cake', 'Food'), testActor);
  await assert.rejects(() => service.deleteCategory(food.id, undefined, testActor), (error: unknown) => error instanceof HttpError && error.code === 'CATEGORY_IN_USE');
  const deleted = await service.deleteCategory(food.id, 'General', testActor);
  assert.equal(deleted.reassigned, 2);
  assert.equal((await service.list({ category: 'General' })).total, 2);
  assert.equal((await service.list({ category: 'Food' })).total, 0);
  const categories = await service.listCategories();
  assert.ok(categories.some((category) => category.name === 'General' && category.wordCount === 2));
  assert.ok(!categories.some((category) => category.name === 'Food'));
});