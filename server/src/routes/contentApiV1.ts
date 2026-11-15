import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { JwtVerifier } from '../auth/verifyJwt';
import { identityFrom, requireAuth } from '../auth/middleware';
import { requireAnyPermission } from '../middleware/authorize';
import { HttpError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import { BlogService, BLOG_STATUSES, type BlogInput } from '../content/blogService';
import { WordService, WORD_DIFFICULTIES, WORD_LANGUAGES, type BulkStrategy, type WordInput } from '../content/wordService';
import { TemplateService, type TemplateRecord } from '../content/templateService';
import { STUDIO_DOC_MAX, STUDIO_JS_ROLES, STUDIO_SENTINEL, studioToObject } from '../content/studioContent';
import { buildBlogsExport, buildCategoriesExport, buildWordsExport, collectPages, detectImportFormat, parseBlogsImport, parseWordsImport, type ExportFile } from '../content/importExport';

const wordCreateSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  word: z.string().min(1).max(64),
  category: z.string().min(1).max(64),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  language: z.string().max(16).optional(),
  hint: z.string().max(300).optional(),
  active: z.boolean().optional(),
}).strict();
const wordUpdateSchema = wordCreateSchema.partial();
const blogCreateSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(300),
  slug: z.string().max(80).optional(),
  excerpt: z.string().max(600).optional(),
  content: z.string().min(1).max(STUDIO_DOC_MAX),
  category: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional(),
  cover: z.string().max(300).optional(),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(300).optional(),
  publishAt: z.string().max(64).optional(),
}).strict();
const blogUpdateSchema = blogCreateSchema.partial();
const confirmSchema = z.object({ confirm: z.literal(true), publishAt: z.string().max(64).optional() }).strict();
const deleteConfirmSchema = z.object({ confirm: z.literal(true), reassignTo: z.string().max(64).optional() }).strict();
const bulkWordsSchema = z.object({ words: z.array(wordCreateSchema).min(1).max(500), strategy: z.enum(['insert', 'skip', 'upsert']).default('skip') }).strict();
const bulkActiveSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500), active: z.boolean(), confirm: z.literal(true) }).strict();
const bulkDeleteSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500), confirm: z.literal(true) }).strict();
const categorySchema = z.object({ name: z.string().min(1).max(64) }).strict();
const templateCreateSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(255).optional(),
  doc: z.record(z.string(), z.unknown()),
}).strict();
const templateJson = (record: TemplateRecord) => ({ ...record, doc: studioToObject(record.doc) ?? {} });
const importSchema = z.object({
  content: z.string().min(1).max(3_000_000),
  filename: z.string().max(255).optional(),
  format: z.enum(['json', 'csv', 'auto']).default('auto'),
  strategy: z.enum(['insert', 'skip', 'upsert', 'replace']).default('skip'),
  dryRun: z.boolean().default(false),
  confirm: z.boolean().optional(),
}).strict();

const actorFrom = (request: Request, response: Response) => {
  const identity = identityFrom(request);
  const admin = response.locals.admin as { role: string };
  return { userId: identity.userId, username: identity.name || 'Admin', role: admin.role };
};
const param = (request: Request, key: string) => { const value = request.params[key]; return Array.isArray(value) ? value[0] : value; };
const parse = <T>(schema: z.ZodType<T>, body: unknown, label: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, `Invalid ${label}.`, 'VALIDATION_ERROR');
  return result.data;
};
const queryString = (request: Request, key: string): string | undefined => {
  const value = request.query[key];
  if (typeof value !== 'string' || value === '') return undefined;
  return value.slice(0, 200);
};
const queryLimit = (request: Request): number | undefined => {
  const raw = queryString(request, 'limit');
  if (raw === undefined) return undefined;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Limit must be an integer between 1 and 100.', 'VALIDATION_ERROR');
  return limit;
};
const blogListQuery = (request: Request) => {
  const status = queryString(request, 'status');
  if (status && !BLOG_STATUSES.includes(status as never)) throw new HttpError(400, 'Invalid status filter.', 'VALIDATION_ERROR');
  const sort = queryString(request, 'sort');
  if (sort && !['title', 'publishedAt', 'createdAt', 'updatedAt', 'views'].includes(sort)) throw new HttpError(400, 'Invalid sort field.', 'VALIDATION_ERROR');
  const order = queryString(request, 'order');
  if (order && order !== 'asc' && order !== 'desc') throw new HttpError(400, 'Order must be asc or desc.', 'VALIDATION_ERROR');
  return { search: queryString(request, 'search'), status: status as never, category: queryString(request, 'category'), tag: queryString(request, 'tag'), sort: sort as never, order: order as 'asc' | 'desc' | undefined, limit: queryLimit(request), cursor: queryString(request, 'cursor') };
};
const wordListQuery = (request: Request) => {
  const difficulty = queryString(request, 'difficulty');
  if (difficulty && !WORD_DIFFICULTIES.includes(difficulty as never)) throw new HttpError(400, 'Invalid difficulty filter.', 'VALIDATION_ERROR');
  const language = queryString(request, 'language');
  if (language && !WORD_LANGUAGES.includes(language)) throw new HttpError(400, 'Invalid language filter.', 'VALIDATION_ERROR');
  const activeRaw = queryString(request, 'active');
  if (activeRaw !== undefined && activeRaw !== 'true' && activeRaw !== 'false') throw new HttpError(400, 'Active must be true or false.', 'VALIDATION_ERROR');
  const sort = queryString(request, 'sort');
  if (sort && !['word', 'category', 'difficulty', 'createdAt', 'updatedAt'].includes(sort)) throw new HttpError(400, 'Invalid sort field.', 'VALIDATION_ERROR');
  const order = queryString(request, 'order');
  if (order && order !== 'asc' && order !== 'desc') throw new HttpError(400, 'Order must be asc or desc.', 'VALIDATION_ERROR');
  return { search: queryString(request, 'search'), category: queryString(request, 'category'), difficulty: difficulty as never, language, active: activeRaw === undefined ? undefined : activeRaw === 'true', sort: sort as never, order: order as 'asc' | 'desc' | undefined, limit: queryLimit(request), cursor: queryString(request, 'cursor') };
};
const pagination = (result: { total: number; nextCursor: string | null }, limit: number | undefined) => ({ limit: limit ?? 25, total: result.total, nextCursor: result.nextCursor });
const exportFormat = (request: Request): 'json' | 'csv' => {
  const raw = queryString(request, 'format') ?? 'json';
  if (raw !== 'json' && raw !== 'csv') throw new HttpError(400, 'Format must be json or csv.', 'VALIDATION_ERROR');
  return raw;
};
const idList = (request: Request): string[] | undefined => {
  const raw = request.query.ids;
  if (typeof raw !== 'string' || raw === '') return undefined;
  if (raw.length > 40_000) throw new HttpError(400, 'Too many selected ids.', 'VALIDATION_ERROR');
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 500) throw new HttpError(400, 'Select between 1 and 500 records.', 'VALIDATION_ERROR');
  return ids;
};
const sendExport = (response: Response, file: ExportFile) => {
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Content-Type', file.contentType);
  response.send(file.body);
};

export function contentApiV1Routes(verify: JwtVerifier, roles: AdminRoleRepository, words: WordService, blogs: BlogService, templates: TemplateService): Router {
  const router = Router();
  const admin = requireAuth(verify);
  const editorAccess = requireAnyPermission(roles, ['words.manage', 'content.blog']);
  // Studio documents can be large; blog writes get a dedicated bigger parser.
  const blogBody = express.json({ limit: '2mb', strict: true });

  router.get('/blogs', async (request, response, next) => {
    try {
      const query = blogListQuery(request);
      const result = await blogs.list(query, { publicOnly: true });
      response.json({ data: result.items, pagination: pagination(result, query.limit) });
    } catch (error) { next(error); }
  });
  router.get('/blogs/:slug', async (request, response, next) => {
    try {
      const article = await blogs.getBySlug(param(request, 'slug'), { publicOnly: true, countView: true });
      const related = await blogs.related(article.id, 3);
      response.json({ data: article, related });
    } catch (error) { next(error); }
  });
  router.get('/public/blogs', async (request, response, next) => {
    try {
      const query = blogListQuery(request);
      const result = await blogs.list(query, { publicOnly: true });
      response.json({ success: true, data: result.items, pagination: { limit: query.limit ?? 25, total: result.total, nextCursor: result.nextCursor } });
    } catch (error) { next(error); }
  });
  router.get('/public/blogs/:slug', async (request, response, next) => {
    try {
      const article = await blogs.getBySlug(param(request, 'slug'), { publicOnly: true, countView: true });
      response.json({ success: true, data: article });
    } catch (error) { next(error); }
  });
  router.get('/words', async (request, response, next) => {
    try {
      const query = wordListQuery(request);
      const result = await words.list({ ...query, active: true });
      const items = result.items.map(({ id, word, category, difficulty, language }) => ({ id, word, category, difficulty, language }));
      response.json({ data: items, pagination: pagination(result, query.limit) });
    } catch (error) { next(error); }
  });
  router.get('/words/categories', async (_request, response, next) => {
    try { response.json({ data: await words.listCategories(true) }); } catch (error) { next(error); }
  });

  const adminRouter = Router();
  adminRouter.use(admin, editorAccess);
  adminRouter.use('/blogs', blogBody);
  adminRouter.use('/blog-templates', blogBody);

  adminRouter.get('/blog-studio/config', async (_request, response, next) => {
    try {
      const actor = actorFrom(_request, response);
      response.json({ data: { contentLimit: await blogs.contentLimit(), studioLimit: await blogs.studioLimit(), canUseCustomJs: STUDIO_JS_ROLES.includes(actor.role), templatesAvailable: await templates.isAvailable() } });
    } catch (error) { next(error); }
  });

  adminRouter.get('/blog-templates', async (_request, response, next) => {
    try { response.json({ data: (await templates.list()).map(templateJson) }); } catch (error) { next(error); }
  });
  adminRouter.post('/blog-templates', async (request, response, next) => {
    try {
      const input = parse(templateCreateSchema, request.body, 'template');
      const serialized = `${STUDIO_SENTINEL}\n${JSON.stringify(input.doc)}`;
      const record = await templates.create({ name: input.name, description: input.description, doc: serialized }, actorFrom(request, response));
      response.status(201).json({ data: templateJson(record) });
    } catch (error) { next(error); }
  });
  adminRouter.delete('/blog-templates/:id', async (request, response, next) => {
    try { parse(deleteConfirmSchema, request.body, 'delete confirmation'); await templates.delete(param(request, 'id'), actorFrom(request, response)); response.json({ data: { deleted: true } }); } catch (error) { next(error); }
  });

  adminRouter.get('/blogs/stats', async (_request, response, next) => { try { response.json({ data: await blogs.stats() }); } catch (error) { next(error); } });
  adminRouter.get('/blogs/categories', async (_request, response, next) => { try { response.json({ data: await blogs.listCategories() }); } catch (error) { next(error); } });
  adminRouter.get('/blogs', async (request, response, next) => {
    try { const query = blogListQuery(request); const result = await blogs.list(query); response.json({ data: result.items, pagination: pagination(result, query.limit) }); } catch (error) { next(error); }
  });
  adminRouter.get('/blogs/:id', async (request, response, next) => { try { response.json({ data: await blogs.get(param(request, 'id')) }); } catch (error) { next(error); } });
  adminRouter.post('/blogs', async (request, response, next) => {
    try { const input = parse(blogCreateSchema, request.body, 'blog post'); response.status(201).json({ data: await blogs.create(input as BlogInput, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.patch('/blogs/:id', async (request, response, next) => {
    try { const input = parse(blogUpdateSchema, request.body, 'blog update'); response.json({ data: await blogs.update(param(request, 'id'), input as Partial<BlogInput>, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.delete('/blogs/:id', async (request, response, next) => {
    try { parse(deleteConfirmSchema, request.body, 'delete confirmation'); await blogs.delete(param(request, 'id'), actorFrom(request, response)); response.json({ data: { deleted: true } }); } catch (error) { next(error); }
  });
  adminRouter.post('/blogs/:id/publish', async (request, response, next) => {
    try { const input = parse(confirmSchema, request.body, 'publish confirmation'); response.json({ data: await blogs.publish(param(request, 'id'), actorFrom(request, response), input.publishAt) }); } catch (error) { next(error); }
  });
  adminRouter.post('/blogs/:id/archive', async (request, response, next) => {
    try { parse(confirmSchema, request.body, 'archive confirmation'); response.json({ data: await blogs.archive(param(request, 'id'), actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.post('/blogs/:id/unpublish', async (request, response, next) => {
    try { parse(confirmSchema, request.body, 'unpublish confirmation'); response.json({ data: await blogs.unpublish(param(request, 'id'), actorFrom(request, response)) }); } catch (error) { next(error); }
  });

  adminRouter.get('/words/stats', async (_request, response, next) => { try { response.json({ data: await words.stats() }); } catch (error) { next(error); } });
  adminRouter.get('/words/categories', async (_request, response, next) => { try { response.json({ data: await words.listCategories() }); } catch (error) { next(error); } });
  adminRouter.post('/words/categories', async (request, response, next) => {
    try { const input = parse(categorySchema, request.body, 'category'); response.status(201).json({ data: await words.createCategory(input.name, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.patch('/words/categories/:id', async (request, response, next) => {
    try { const input = parse(categorySchema, request.body, 'category'); response.json({ data: await words.renameCategory(param(request, 'id'), input.name, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.delete('/words/categories/:id', async (request, response, next) => {
    try { const input = parse(deleteConfirmSchema, request.body, 'delete confirmation'); response.json({ data: await words.deleteCategory(param(request, 'id'), input.reassignTo, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.post('/words/bulk', async (request, response, next) => {
    try { const input = parse(bulkWordsSchema, request.body, 'bulk word import'); response.json({ data: await words.bulkCreate(input.words as WordInput[], input.strategy as BulkStrategy, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.post('/words/bulk-active', async (request, response, next) => {
    try { const input = parse(bulkActiveSchema, request.body, 'bulk activation'); response.json({ data: await words.setActive(input.ids, input.active, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.post('/words/bulk-delete', async (request, response, next) => {
    try { const input = parse(bulkDeleteSchema, request.body, 'bulk deletion'); response.json({ data: await words.deleteMany(input.ids, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.get('/words', async (request, response, next) => {
    try { const query = wordListQuery(request); const result = await words.list(query); response.json({ data: result.items, pagination: pagination(result, query.limit) }); } catch (error) { next(error); }
  });
  adminRouter.get('/words/:id', async (request, response, next) => { try { response.json({ data: await words.get(param(request, 'id')) }); } catch (error) { next(error); } });
  adminRouter.post('/words', async (request, response, next) => {
    try { const input = parse(wordCreateSchema, request.body, 'word'); response.status(201).json({ data: await words.create(input as WordInput, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.patch('/words/:id', async (request, response, next) => {
    try { const input = parse(wordUpdateSchema, request.body, 'word update'); response.json({ data: await words.update(param(request, 'id'), input as Partial<WordInput>, actorFrom(request, response)) }); } catch (error) { next(error); }
  });
  adminRouter.delete('/words/:id', async (request, response, next) => {
    try { parse(deleteConfirmSchema, request.body, 'delete confirmation'); await words.delete(param(request, 'id'), actorFrom(request, response)); response.json({ data: { deleted: true } }); } catch (error) { next(error); }
  });

  adminRouter.use('/import', express.json({ limit: '3mb', strict: true }), rateLimit(20, 60_000));
  adminRouter.use('/export', rateLimit(30, 60_000));

  adminRouter.post('/import/words', async (request, response, next) => {
    try {
      const body = parse(importSchema, request.body, 'word import');
      const format = body.format === 'auto' ? detectImportFormat(body.filename, body.content) : body.format;
      const parsed = parseWordsImport(body.content, format);
      const report = await words.importWords(parsed.inputs, body.strategy, actorFrom(request, response), { dryRun: body.dryRun, confirm: body.confirm });
      response.json({ data: { ...report, format, warnings: [...parsed.warnings, ...report.warnings] } });
    } catch (error) { next(error); }
  });
  adminRouter.post('/import/blogs', async (request, response, next) => {
    try {
      const body = parse(importSchema, request.body, 'blog import');
      const format = body.format === 'auto' ? detectImportFormat(body.filename, body.content) : body.format;
      const parsed = parseBlogsImport(body.content, format);
      const report = await blogs.importBlogs(parsed.inputs, body.strategy, actorFrom(request, response), { dryRun: body.dryRun, confirm: body.confirm });
      response.json({ data: { ...report, format, warnings: [...parsed.warnings, ...report.warnings] } });
    } catch (error) { next(error); }
  });

  adminRouter.get('/export/words', async (request, response, next) => {
    try {
      const format = exportFormat(request);
      const query = wordListQuery(request);
      const ids = idList(request);
      let records = await collectPages((cursor) => words.list({ ...query, limit: 100, cursor }));
      if (ids) { const selected = new Set(ids); records = records.filter((record) => selected.has(record.id)); }
      const categories = await words.listCategories();
      sendExport(response, buildWordsExport(records, categories, format, ids ? 'selected' : 'all', { category: query.category, difficulty: query.difficulty, language: query.language, active: query.active }));
    } catch (error) { next(error); }
  });
  adminRouter.get('/export/blogs', async (request, response, next) => {
    try {
      const format = exportFormat(request);
      const scope = queryString(request, 'scope') ?? 'all';
      if (!['all', 'published', 'draft', 'selected'].includes(scope)) throw new HttpError(400, 'Scope must be all, published, draft, or selected.', 'VALIDATION_ERROR');
      const ids = idList(request);
      if (scope === 'selected' && !ids) throw new HttpError(400, 'Selected scope requires ids.', 'VALIDATION_ERROR');
      const status = scope === 'published' ? 'published' : scope === 'draft' ? 'draft' : undefined;
      const query = blogListQuery(request);
      let records = await collectPages((cursor) => blogs.list({ ...query, status: status as never, limit: 100, cursor }));
      if (ids) { const selected = new Set(ids); records = records.filter((record) => selected.has(record.id)); }
      sendExport(response, buildBlogsExport(records, format, scope, { category: query.category, tag: query.tag }));
    } catch (error) { next(error); }
  });
  adminRouter.get('/export/categories', async (request, response, next) => {
    try { sendExport(response, buildCategoriesExport(await words.listCategories(), exportFormat(request))); } catch (error) { next(error); }
  });

  router.use('/admin', adminRouter);
  return router;
}