import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { HttpError } from '../middleware/errors';
import { RowRepository, type Row } from '../repositories/rowRepository';
import { decodeCursor, encodeCursor, slugifyName, type ContentActor, type ImportStrategy } from './wordService';
import { prepareStudio, STUDIO_DOC_MAX } from './studioContent';

export type BlogStatus = 'draft' | 'published' | 'scheduled' | 'archived';
export const BLOG_STATUSES: BlogStatus[] = ['draft', 'published', 'scheduled', 'archived'];
export const BLOG_SORT_FIELDS = ['title', 'publishedAt', 'createdAt', 'updatedAt', 'views'] as const;
export type BlogSortField = typeof BLOG_SORT_FIELDS[number];

export interface BlogInput { id?: string; title: string; slug?: string; excerpt?: string; content: string; category?: string; tags?: string[]; status?: BlogStatus; cover?: string; seoTitle?: string; seoDescription?: string; publishAt?: string }
export interface BlogRecord { id: string; slug: string; title: string; excerpt: string; content: string; studioDoc: string; category: string; tags: string[]; status: string; cover: string; author: string; seoTitle: string; seoDescription: string; publishedAt: string; createdAt: string; updatedAt: string; views: number }
export interface BlogListQuery { search?: string; status?: BlogStatus; category?: string; tag?: string; sort?: BlogSortField; order?: 'asc' | 'desc'; limit?: number; cursor?: string }
export interface BlogListResult { items: BlogRecord[]; total: number; nextCursor: string | null }
export interface BlogStats { total: number; published: number; draft: number; scheduled: number; archived: number; totalViews: number; mostViewed: BlogRecord[]; recent: BlogRecord[] }
export interface BlogImportResult { index: number; title: string; slug: string; status: 'created' | 'updated' | 'skipped' | 'failed'; id?: string; error?: string }
export interface BlogImportReport { results: BlogImportResult[]; created: number; updated: number; skipped: number; failed: number; dryRun: boolean; warnings: string[] }

const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isPubliclyVisible(post: { status: string; publishedAt: string }, now = Date.now()): boolean {
  if (post.status === 'published') return true;
  if (post.status === 'scheduled' && post.publishedAt) { const at = Date.parse(post.publishedAt); return Number.isFinite(at) && at <= now; }
  return false;
}

function cleanTags(tags: unknown): string[] {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw new HttpError(400, 'Tags must be an array of strings.', 'VALIDATION_ERROR');
  if (tags.length > 10) throw new HttpError(400, 'A post accepts at most 10 tags.', 'VALIDATION_ERROR');
  const cleaned = tags.map((tag) => String(tag ?? '').trim().toLowerCase()).filter(Boolean);
  if (cleaned.some((tag) => tag.length > 32 || UNSAFE_TEXT.test(tag) || /[<>]/.test(tag))) throw new HttpError(400, 'Each tag must be at most 32 characters without markup.', 'VALIDATION_ERROR');
  return [...new Set(cleaned)];
}

export function validateBlogInput(input: BlogInput, maxContent = 10000): Required<Omit<BlogInput, 'id'>> & { id?: string } {
  const title = String(input.title ?? '').trim();
  if (title.length < 1 || title.length > 255 || UNSAFE_TEXT.test(title)) throw new HttpError(400, 'Title must be 1 to 255 characters.', 'VALIDATION_ERROR');
  const slug = input.slug === undefined || input.slug === '' ? slugifyName(title) : String(input.slug).trim().toLowerCase();
  if (!slug || slug.length > 64 || !SLUG_PATTERN.test(slug)) throw new HttpError(400, 'Slug must be lowercase letters, numbers, and hyphens (max 64).', 'VALIDATION_ERROR');
  const excerpt = String(input.excerpt ?? '').trim();
  if (excerpt.length > 500 || UNSAFE_TEXT.test(excerpt)) throw new HttpError(400, 'Excerpt must be at most 500 characters.', 'VALIDATION_ERROR');
  const content = String(input.content ?? '');
  if (content.length < 1 || content.length > maxContent || UNSAFE_TEXT.test(content)) throw new HttpError(400, `Content must be 1 to ${maxContent} characters.`, 'VALIDATION_ERROR');
  const category = String(input.category ?? '').trim() || 'News';
  if (category.length > 64 || UNSAFE_TEXT.test(category) || /[<>]/.test(category)) throw new HttpError(400, 'Category must be at most 64 characters without markup.', 'VALIDATION_ERROR');
  const status = input.status ?? 'draft';
  if (!BLOG_STATUSES.includes(status)) throw new HttpError(400, 'Status must be draft, published, scheduled, or archived.', 'VALIDATION_ERROR');
  const cover = String(input.cover ?? '').trim();
  if (cover.length > 255 || UNSAFE_TEXT.test(cover)) throw new HttpError(400, 'Featured image reference must be at most 255 characters.', 'VALIDATION_ERROR');
  const seoTitle = String(input.seoTitle ?? '').trim();
  if (seoTitle.length > 128 || UNSAFE_TEXT.test(seoTitle)) throw new HttpError(400, 'SEO title must be at most 128 characters.', 'VALIDATION_ERROR');
  const seoDescription = String(input.seoDescription ?? '').trim();
  if (seoDescription.length > 255 || UNSAFE_TEXT.test(seoDescription)) throw new HttpError(400, 'SEO description must be at most 255 characters.', 'VALIDATION_ERROR');
  let publishAt = String(input.publishAt ?? '').trim();
  if (publishAt) {
    if (publishAt.length > 64 || !Number.isFinite(Date.parse(publishAt))) throw new HttpError(400, 'Publish date must be a valid ISO timestamp.', 'VALIDATION_ERROR');
    publishAt = new Date(publishAt).toISOString();
  }
  if (status === 'scheduled' && !publishAt) throw new HttpError(400, 'Scheduled posts require a publish date.', 'VALIDATION_ERROR');
  if (status === 'published' && !publishAt) publishAt = new Date().toISOString();
  return { id: input.id, title, slug, excerpt, content, category, tags: cleanTags(input.tags), status, cover, seoTitle, seoDescription, publishAt };
}

export class BlogService {
  private readonly posts: RowRepository;
  private readonly categories: RowRepository;
  private readonly audit: RowRepository;
  private columnMeta?: Promise<{ keys: Set<string>; contentSize: number }>;

  constructor(private readonly database: AppwriteDatabase) {
    this.posts = new RowRepository(database, 'blog_posts');
    this.categories = new RowRepository(database, 'blog_categories');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  private meta(): Promise<{ keys: Set<string>; contentSize: number }> {
    if (!this.columnMeta) {
      this.columnMeta = this.database.tables.listColumns(this.database.databaseId, 'blog_posts', [])
        .then((result) => {
          const columns = result.columns as Array<{ key: string; size?: number }>;
          const content = columns.find((column) => column.key === 'content');
          const size = Number(content?.size);
          return { keys: new Set(columns.map((column) => column.key)), contentSize: Number.isFinite(size) && size > 0 ? size : 10000 };
        })
        .catch(() => ({ keys: new Set<string>(), contentSize: 10000 }));
    }
    return this.columnMeta;
  }

  private async optional(): Promise<Set<string>> {
    return (await this.meta()).keys;
  }

  async contentLimit(): Promise<number> {
    return (await this.meta()).contentSize;
  }

  /* Effective cap for a serialized studio document: the studioDoc column when
     present, otherwise the content column it must share with legacy text. */
  async studioLimit(): Promise<number> {
    const { keys, contentSize } = await this.meta();
    return keys.has('studioDoc') ? STUDIO_DOC_MAX : contentSize;
  }

  /* Map a validated payload onto the content/studioDoc columns. With the studio
     column present the full document lives in studioDoc and content keeps a
     plain-text projection for search and legacy readers; without it the
     serialized document must fit the content column. */
  private async studioFields(clean: { content: string; title: string }, actorRole: string, optional: Set<string>): Promise<{ content: string; studioDoc?: string }> {
    const limit = await this.contentLimit();
    const prepared = prepareStudio(clean.content, actorRole);
    if (!prepared.isStudio) return optional.has('studioDoc') ? { content: clean.content, studioDoc: '' } : { content: clean.content };
    if (optional.has('studioDoc')) return { content: prepared.plain.slice(0, limit) || clean.title, studioDoc: prepared.serialized };
    if (prepared.serialized.length > limit) throw new HttpError(400, `Studio content exceeds the ${limit} character content limit. Run the studio migration to store larger documents.`, 'CONTENT_TOO_LARGE');
    return { content: prepared.serialized };
  }

  private async allRows(): Promise<Row[]> {
    const rows: Row[] = [];
    for (let page = 0; page < 200; page += 1) {
      const batch = await this.posts.list([Query.limit(100), Query.offset(page * 100)]);
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows;
  }

  private async categoryNames(): Promise<Map<string, string>> {
    const rows = await this.categories.list([Query.limit(200)]);
    return new Map(rows.map((row) => [String(row.id), String(row.name)]));
  }

  private toRecord(row: Row, categoryName: string): BlogRecord {
    return {
      id: String(row.id ?? row.$id),
      slug: String(row.slug ?? ''),
      title: String(row.title ?? ''),
      excerpt: String(row.excerpt ?? ''),
      content: String(row.content ?? ''),
      studioDoc: String(row.studioDoc ?? ''),
      category: categoryName,
      tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
      status: String(row.status ?? 'draft'),
      cover: String(row.featuredImage ?? ''),
      author: String(row.authorName ?? ''),
      seoTitle: String(row.seoTitle ?? ''),
      seoDescription: String(row.seoDescription ?? ''),
      publishedAt: String(row.publishedAt ?? ''),
      createdAt: String(row.createdAt || row.$createdAt || ''),
      updatedAt: String(row.updatedAt || row.$updatedAt || ''),
      views: Number(row.views) || 0,
    };
  }

  private async loadAll(): Promise<BlogRecord[]> {
    const [rows, names] = await Promise.all([this.allRows(), this.categoryNames()]);
    return rows.map((row) => this.toRecord(row, names.get(String(row.categoryId)) || 'News'));
  }

  async list(query: BlogListQuery = {}, options: { publicOnly?: boolean } = {}): Promise<BlogListResult> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const offset = decodeCursor(query.cursor);
    const search = query.search?.trim().toLowerCase();
    let items = await this.loadAll();
    if (options.publicOnly) items = items.filter((item) => isPubliclyVisible(item));
    if (query.status) items = items.filter((item) => item.status === query.status);
    if (query.category) items = items.filter((item) => item.category.toLowerCase() === query.category!.toLowerCase());
    if (query.tag) items = items.filter((item) => item.tags.includes(query.tag!.toLowerCase()));
    if (search) items = items.filter((item) => item.title.toLowerCase().includes(search) || item.excerpt.toLowerCase().includes(search) || item.content.toLowerCase().includes(search) || item.tags.some((tag) => tag.includes(search)));
    const sort = query.sort ?? (options.publicOnly ? 'publishedAt' : 'createdAt');
    const direction = query.order === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      const left = a[sort]; const right = b[sort];
      if (typeof left === 'number' && typeof right === 'number') return direction * (left - right);
      return direction * String(left).localeCompare(String(right));
    });
    const total = items.length;
    const page = items.slice(offset, offset + limit);
    return { items: page, total, nextCursor: offset + limit < total ? encodeCursor(offset + limit) : null };
  }

  async stats(): Promise<BlogStats> {
    const items = await this.loadAll();
    const count = (status: BlogStatus) => items.filter((item) => item.status === status).length;
    const published = items.filter((item) => isPubliclyVisible(item));
    return {
      total: items.length,
      published: count('published'),
      draft: count('draft'),
      scheduled: count('scheduled'),
      archived: count('archived'),
      totalViews: items.reduce((sum, item) => sum + item.views, 0),
      mostViewed: [...published].sort((a, b) => b.views - a.views).slice(0, 5),
      recent: [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5),
    };
  }

  async get(id: string): Promise<BlogRecord> {
    const items = await this.loadAll();
    const found = items.find((item) => item.id === id);
    if (!found) throw new HttpError(404, 'Blog post not found.', 'POST_NOT_FOUND');
    return found;
  }

  async getBySlug(slug: string, options: { publicOnly?: boolean; countView?: boolean } = {}): Promise<BlogRecord> {
    const rows = await this.allRows();
    const row = rows.find((item) => String(item.slug) === slug);
    if (!row) throw new HttpError(404, 'Article not found.', 'POST_NOT_FOUND');
    const names = await this.categoryNames();
    const record = this.toRecord(row, names.get(String(row.categoryId)) || 'News');
    if (options.publicOnly && !isPubliclyVisible(record)) throw new HttpError(404, 'Article not found.', 'POST_NOT_FOUND');
    if (options.publicOnly && options.countView) {
      this.posts.patch(row.$id, { views: record.views + 1 }).catch(() => undefined);
      record.views += 1;
    }
    return record;
  }

  async related(idOrSlug: string, limit = 3): Promise<BlogRecord[]> {
    const items = (await this.loadAll()).filter((item) => isPubliclyVisible(item));
    const source = items.find((item) => item.id === idOrSlug || item.slug === idOrSlug);
    if (!source) return [];
    return items
      .filter((item) => item.id !== source.id)
      .map((item) => ({ item, score: (item.category === source.category ? 2 : 0) + item.tags.filter((tag) => source.tags.includes(tag)).length }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.item.views - a.item.views)
      .slice(0, Math.min(Math.max(limit, 1), 10))
      .map((entry) => entry.item);
  }

  async create(input: BlogInput, actor: ContentActor): Promise<BlogRecord> {
    const optional = await this.optional();
    const cap = optional.has('studioDoc') ? STUDIO_DOC_MAX : await this.contentLimit();
    const clean = validateBlogInput(input, cap);
    const rows = await this.allRows();
    if (rows.some((row) => String(row.slug) === clean.slug)) throw new HttpError(409, 'A post with this slug already exists.', 'SLUG_DUPLICATE');
    if (clean.id && rows.some((row) => String(row.id) === clean.id)) throw new HttpError(409, 'A post with this ID already exists.', 'POST_DUPLICATE');
    const category = await this.getOrCreateCategory(clean.category);
    const fields = await this.studioFields(clean, actor.role, optional);
    const now = new Date().toISOString();
    const data: Record<string, unknown> = {
      id: clean.id || randomUUID().replaceAll('-', '').slice(0, 32), slug: clean.slug, title: clean.title, excerpt: clean.excerpt, content: fields.content,
      categoryId: String(category.id), status: clean.status, featuredImage: clean.cover, seoTitle: clean.seoTitle, seoDescription: clean.seoDescription,
      publishedAt: clean.publishAt, authorId: actor.userId, authorName: actor.username.slice(0, 64), views: 0, createdAt: now, updatedAt: now,
    };
    if (fields.studioDoc !== undefined) data.studioDoc = fields.studioDoc;
    if (optional.has('tags')) data.tags = clean.tags;
    const row = await this.posts.insert(data);
    await this.writeAudit(actor, 'blog.create', 'blog_post', String(data.id), `${clean.status}: ${clean.title}`);
    const names = await this.categoryNames();
    return this.toRecord(row, names.get(String(row.categoryId)) || clean.category);
  }

  async update(id: string, patch: Partial<BlogInput>, actor: ContentActor): Promise<BlogRecord> {
    const rows = await this.allRows();
    const existing = rows.find((row) => String(row.id ?? row.$id) === id);
    if (!existing) throw new HttpError(404, 'Blog post not found.', 'POST_NOT_FOUND');
    const names = await this.categoryNames();
    const current = this.toRecord(existing, names.get(String(existing.categoryId)) || 'News');
    const optional = await this.optional();
    const cap = optional.has('studioDoc') ? STUDIO_DOC_MAX : await this.contentLimit();
    const contentSource = patch.content !== undefined ? patch.content : (current.studioDoc || current.content);
    const clean = validateBlogInput({
      title: patch.title ?? current.title, slug: patch.slug ?? current.slug, excerpt: patch.excerpt ?? current.excerpt, content: contentSource,
      category: patch.category ?? current.category, tags: patch.tags ?? current.tags, status: (patch.status ?? current.status) as BlogStatus,
      cover: patch.cover ?? current.cover, seoTitle: patch.seoTitle ?? current.seoTitle, seoDescription: patch.seoDescription ?? current.seoDescription,
      publishAt: patch.publishAt ?? current.publishedAt,
    }, cap);
    if (rows.some((row) => row.$id !== existing.$id && String(row.slug) === clean.slug)) throw new HttpError(409, 'A post with this slug already exists.', 'SLUG_DUPLICATE');
    const category = await this.getOrCreateCategory(clean.category);
    const fields = await this.studioFields(clean, actor.role, optional);
    const data: Record<string, unknown> = {
      slug: clean.slug, title: clean.title, excerpt: clean.excerpt, content: fields.content, categoryId: String(category.id), status: clean.status,
      featuredImage: clean.cover, seoTitle: clean.seoTitle, seoDescription: clean.seoDescription, publishedAt: clean.publishAt, updatedAt: new Date().toISOString(),
    };
    if (fields.studioDoc !== undefined) data.studioDoc = fields.studioDoc;
    if (optional.has('tags')) data.tags = clean.tags;
    const row = await this.posts.patch(existing.$id, data);
    await this.writeAudit(actor, 'blog.update', 'blog_post', id, `${clean.status}: ${clean.title}`);
    return this.toRecord(row, clean.category);
  }

  async publish(id: string, actor: ContentActor, at?: string): Promise<BlogRecord> {
    let publishAt = new Date().toISOString();
    if (at) {
      if (!Number.isFinite(Date.parse(at))) throw new HttpError(400, 'Publish date must be a valid ISO timestamp.', 'VALIDATION_ERROR');
      publishAt = new Date(at).toISOString();
    }
    return this.setStatus(id, 'published', actor, publishAt);
  }

  async archive(id: string, actor: ContentActor): Promise<BlogRecord> {
    return this.setStatus(id, 'archived', actor);
  }

  async unpublish(id: string, actor: ContentActor): Promise<BlogRecord> {
    return this.setStatus(id, 'draft', actor);
  }

  private async setStatus(id: string, status: BlogStatus, actor: ContentActor, publishAt?: string): Promise<BlogRecord> {
    const rows = await this.allRows();
    const existing = rows.find((row) => String(row.id ?? row.$id) === id);
    if (!existing) throw new HttpError(404, 'Blog post not found.', 'POST_NOT_FOUND');
    const data: Record<string, unknown> = { status, updatedAt: new Date().toISOString() };
    if (publishAt) data.publishedAt = publishAt;
    const row = await this.posts.patch(existing.$id, data);
    await this.writeAudit(actor, `blog.${status === 'published' ? 'publish' : status === 'archived' ? 'archive' : 'unpublish'}`, 'blog_post', id, status);
    const names = await this.categoryNames();
    return this.toRecord(row, names.get(String(row.categoryId)) || 'News');
  }

  async delete(id: string, actor: ContentActor): Promise<void> {
    const rows = await this.allRows();
    const existing = rows.find((row) => String(row.id ?? row.$id) === id);
    if (!existing) throw new HttpError(404, 'Blog post not found.', 'POST_NOT_FOUND');
    await this.posts.delete(existing.$id);
    await this.writeAudit(actor, 'blog.delete', 'blog_post', id, String(existing.title ?? ''));
  }

  async importBlogs(inputs: BlogInput[], strategy: ImportStrategy, actor: ContentActor, options: { dryRun?: boolean; confirm?: boolean } = {}): Promise<BlogImportReport> {
    if (inputs.length === 0) throw new HttpError(400, 'The import file contains no records.', 'EMPTY_IMPORT');
    if (inputs.length > 200) throw new HttpError(400, 'An import accepts at most 200 blog posts per file.', 'IMPORT_LIMIT');
    const dryRun = options.dryRun === true;
    if (strategy === 'replace' && !dryRun && options.confirm !== true) throw new HttpError(400, 'Replacing existing posts requires explicit confirmation.', 'CONFIRM_REQUIRED');
    const rows = await this.allRows();
    const bySlug = new Map(rows.map((row) => [String(row.slug ?? ''), row]));
    const byId = new Map(rows.map((row) => [String(row.id ?? row.$id), row]));
    const results: BlogImportResult[] = [];
    const warnings: string[] = [];
    let created = 0; let updated = 0; let skipped = 0; let failed = 0;
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      let title = String(input.title ?? ''); let slug = String(input.slug ?? '');
      try {
        const clean = validateBlogInput(input);
        title = clean.title; slug = clean.slug;
        const existing = (clean.id ? byId.get(clean.id) : undefined) ?? bySlug.get(clean.slug);
        if (existing) {
          const existingId = String(existing.id ?? existing.$id);
          if (strategy === 'skip') { results.push({ index, title, slug, status: 'skipped', id: existingId }); skipped += 1; continue; }
          if (strategy === 'insert') { results.push({ index, title, slug, status: 'failed', error: 'A post with this slug already exists.' }); failed += 1; continue; }
          if (clean.status === 'published') warnings.push(`Record ${index + 1}: "${clean.title}" will be published immediately.`);
          if (!dryRun) await this.update(existingId, clean, actor);
          results.push({ index, title, slug, status: 'updated', id: existingId }); updated += 1; continue;
        }
        if (strategy === 'replace') {
          warnings.push(`Record ${index + 1}: no existing post matches "${clean.slug}". Replace only updates existing records.`);
          results.push({ index, title, slug, status: 'skipped' }); skipped += 1; continue;
        }
        if (clean.status === 'published') warnings.push(`Record ${index + 1}: "${clean.title}" will be published immediately.`);
        if (dryRun) {
          bySlug.set(clean.slug, { $id: '', id: '', slug: clean.slug } as Row);
          results.push({ index, title, slug, status: 'created' }); created += 1; continue;
        }
        const record = await this.create(clean, actor);
        const stub = { $id: record.id, id: record.id, slug: record.slug } as Row;
        bySlug.set(record.slug, stub);
        byId.set(record.id, stub);
        results.push({ index, title, slug, status: 'created', id: record.id }); created += 1;
      } catch (error) {
        results.push({ index, title, slug, status: 'failed', error: error instanceof Error ? error.message : 'Import failed.' }); failed += 1;
      }
    }
    if (!dryRun) await this.writeAudit(actor, 'blog.import', 'blog_post', `bulk:${results.length}`, `${strategy}: +${created} ~${updated} skip ${skipped} fail ${failed}`);
    return { results, created, updated, skipped, failed, dryRun, warnings };
  }

  async listCategories(): Promise<{ id: string; name: string; slug: string; postCount: number }[]> {
    const [rows, posts] = await Promise.all([this.categories.list([Query.limit(200)]), this.allRows()]);
    const counts = new Map<string, number>();
    for (const post of posts) counts.set(String(post.categoryId), (counts.get(String(post.categoryId)) || 0) + 1);
    return rows.map((row) => ({ id: String(row.id ?? row.$id), name: String(row.name), slug: String(row.slug), postCount: counts.get(String(row.id)) || 0 })).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async getOrCreateCategory(name: string): Promise<Row> {
    const clean = name.trim().slice(0, 64) || 'News';
    const slug = slugifyName(clean) || 'news';
    const rows = await this.categories.list([Query.limit(200)]);
    const existing = rows.find((row) => String(row.slug) === slug || String(row.name).toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    return this.categories.insert({ id: randomUUID().replaceAll('-', ''), name: clean, slug, description: '', isActive: true });
  }

  private async writeAudit(actor: ContentActor, action: string, resourceType: string, resourceId: string, reason: string): Promise<void> {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}