import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../middleware/errors';
import { BlogService, isPubliclyVisible } from './blogService';
import { createContentDouble, testActor } from './contentTestDouble';

const article = (title: string, extra: Record<string, unknown> = {}) => ({ title, content: `Body of ${title}.`, ...extra });

test('blog service creates drafts with generated slug, category and audit', async () => {
  const { database, rows } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const created = await service.create(article('Welcome to DrawSpace!', { tags: ['News', 'community', 'news'] }), testActor);
  assert.equal(created.status, 'draft');
  assert.equal(created.slug, 'welcome-to-drawspace');
  assert.equal(created.category, 'News');
  assert.deepEqual(created.tags, ['news', 'community']);
  assert.equal(created.author, 'Admin');
  assert.equal(created.views, 0);
  assert.equal(rows.get('audit_logs')?.size, 1);
  assert.equal(rows.get('blog_categories')?.size, 1);
  await assert.rejects(() => service.create(article('Other', { slug: 'welcome-to-drawspace' }), testActor), (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'SLUG_DUPLICATE');
});

test('blog service validates input and scheduling requirements', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  await assert.rejects(() => service.create(article('x', { content: '' }), testActor), (error: unknown) => error instanceof HttpError && error.status === 400);
  await assert.rejects(() => service.create(article('x', { status: 'scheduled' }), testActor), (error: unknown) => error instanceof HttpError && error.status === 400);
  await assert.rejects(() => service.create(article('x', { slug: 'Bad Slug!' }), testActor), (error: unknown) => error instanceof HttpError && error.status === 400);
  await assert.rejects(() => service.create(article('x', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }), testActor), (error: unknown) => error instanceof HttpError && error.status === 400);
  const scheduled = await service.create(article('Future', { status: 'scheduled', publishAt: '2030-01-01T00:00:00.000Z' }), testActor);
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.publishedAt, '2030-01-01T00:00:00.000Z');
});

test('blog service publish, archive, unpublish and delete lifecycle', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const post = await service.create(article('Lifecycle'), testActor);
  const published = await service.publish(post.id, testActor);
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt);
  const archived = await service.archive(post.id, testActor);
  assert.equal(archived.status, 'archived');
  const draft = await service.unpublish(post.id, testActor);
  assert.equal(draft.status, 'draft');
  await service.delete(post.id, testActor);
  await assert.rejects(() => service.get(post.id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(() => service.publish('missing', testActor), (error: unknown) => error instanceof HttpError && error.status === 404);
});

test('blog service updates fields and keeps slug unique', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const first = await service.create(article('First', { tags: ['a'] }), testActor);
  await service.create(article('Second'), testActor);
  const updated = await service.update(first.id, { title: 'First Revised', tags: ['b', 'c'], excerpt: 'Updated excerpt', seoTitle: 'SEO' }, testActor);
  assert.equal(updated.title, 'First Revised');
  assert.equal(updated.slug, 'first');
  assert.deepEqual(updated.tags, ['b', 'c']);
  assert.equal(updated.seoTitle, 'SEO');
  await assert.rejects(() => service.update(first.id, { slug: 'second' }, testActor), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test('public visibility hides drafts, archived and future scheduled posts', () => {
  const now = Date.parse('2026-11-14T12:00:00.000Z');
  assert.equal(isPubliclyVisible({ status: 'published', publishedAt: '' }, now), true);
  assert.equal(isPubliclyVisible({ status: 'draft', publishedAt: '' }, now), false);
  assert.equal(isPubliclyVisible({ status: 'archived', publishedAt: '2020-01-01T00:00:00.000Z' }, now), false);
  assert.equal(isPubliclyVisible({ status: 'scheduled', publishedAt: '2026-11-14T11:00:00.000Z' }, now), true);
  assert.equal(isPubliclyVisible({ status: 'scheduled', publishedAt: '2026-11-14T13:00:00.000Z' }, now), false);
});

test('public listing and detail never expose unpublished content', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const live = await service.create(article('Live', { category: 'Guides' }), testActor);
  await service.publish(live.id, testActor);
  await service.create(article('Secret draft', { category: 'Guides' }), testActor);
  const archived = await service.create(article('Archived', { category: 'Guides' }), testActor);
  await service.publish(archived.id, testActor);
  await service.archive(archived.id, testActor);
  const future = await service.create(article('Future', { status: 'scheduled', publishAt: '2030-01-01T00:00:00.000Z' }), testActor);
  const publicList = await service.list({}, { publicOnly: true });
  assert.deepEqual(publicList.items.map((item) => item.title), ['Live']);
  await assert.rejects(() => service.getBySlug('secret-draft', { publicOnly: true }), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(() => service.getBySlug('archived', { publicOnly: true }), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(() => service.getBySlug(future.slug, { publicOnly: true }), (error: unknown) => error instanceof HttpError && error.status === 404);
  const detail = await service.getBySlug('live', { publicOnly: true, countView: true });
  assert.equal(detail.views, 1);
  const adminList = await service.list({});
  assert.equal(adminList.total, 4);
});

test('blog listing supports search, category, tag filters and pagination', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const a = await service.create(article('Drawing tips', { category: 'Guides', tags: ['tips'] }), testActor);
  const b = await service.create(article('Word lists', { category: 'Guides', tags: ['words'] }), testActor);
  const c = await service.create(article('Community news', { category: 'News', tags: ['tips'] }), testActor);
  for (const post of [a, b, c]) await service.publish(post.id, testActor);
  assert.equal((await service.list({ category: 'guides' })).total, 2);
  assert.equal((await service.list({ tag: 'tips' })).total, 2);
  assert.equal((await service.list({ search: 'word' })).total, 1);
  assert.equal((await service.list({ status: 'published' })).total, 3);
  const pageOne = await service.list({ limit: 2, sort: 'title', order: 'asc' });
  assert.deepEqual(pageOne.items.map((item) => item.title), ['Community news', 'Drawing tips']);
  const pageTwo = await service.list({ limit: 2, sort: 'title', order: 'asc', cursor: pageOne.nextCursor! });
  assert.deepEqual(pageTwo.items.map((item) => item.title), ['Word lists']);
  assert.equal(pageTwo.nextCursor, null);
});

test('related articles prefer shared category and tags, published only', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const source = await service.create(article('Source', { category: 'Guides', tags: ['tips', 'draw'] }), testActor);
  const sameCategory = await service.create(article('Same category', { category: 'Guides' }), testActor);
  const sharedTag = await service.create(article('Shared tag', { category: 'News', tags: ['tips'] }), testActor);
  const draft = await service.create(article('Draft relative', { category: 'Guides', tags: ['tips'] }), testActor);
  for (const post of [source, sameCategory, sharedTag]) await service.publish(post.id, testActor);
  const related = await service.related(source.slug);
  assert.deepEqual(related.map((item) => item.id), [sameCategory.id, sharedTag.id]);
  assert.ok(!related.some((item) => item.id === draft.id));
});

test('blog stats use stored data only', async () => {
  const { database } = createContentDouble({ migrated: true });
  const service = new BlogService(database);
  const a = await service.create(article('A'), testActor);
  const b = await service.create(article('B'), testActor);
  await service.publish(a.id, testActor);
  await service.getBySlug(a.slug, { publicOnly: true, countView: true });
  await service.getBySlug(a.slug, { publicOnly: true, countView: true });
  await service.archive(b.id, testActor);
  await service.create(article('C'), testActor);
  const stats = await service.stats();
  assert.equal(stats.total, 3);
  assert.equal(stats.published, 1);
  assert.equal(stats.draft, 1);
  assert.equal(stats.archived, 1);
  assert.equal(stats.totalViews, 2);
  assert.equal(stats.mostViewed[0].id, a.id);
});

test('blog service works before migration without tags column', async () => {
  const { database, rows } = createContentDouble({ migrated: false });
  const service = new BlogService(database);
  const created = await service.create(article('Legacy', { tags: ['news'] }), testActor);
  assert.deepEqual(created.tags, []);
  const stored = [...rows.get('blog_posts')!.values()][0];
  assert.equal('tags' in stored, false);
  const updated = await service.update(created.id, { title: 'Legacy Revised' }, testActor);
  assert.equal(updated.title, 'Legacy Revised');
});