import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { HttpError } from '../middleware/errors';
import { BlogService, type BlogStatus } from '../content/blogService';
import { WordService, type ContentActor, type ImportStrategy, type WordDifficulty } from '../content/wordService';
import { buildBlogsExport, buildWordsExport, collectPages, detectImportFormat, parseBlogsImport, parseWordsImport } from '../content/importExport';
import type { McpKeyContext } from './keyService';
import type { McpScope } from './scopes';

const difficulties = ['easy', 'medium', 'hard'] as const;
const blogStatuses = ['draft', 'published', 'scheduled', 'archived'] as const;
const importStrategies = ['insert', 'skip', 'upsert', 'replace'] as const;

interface ToolOutcome { message: string; data?: unknown }

function envelope(success: boolean, message: string, data?: unknown, code?: string): CallToolResult {
  const payload: Record<string, unknown> = { success, message };
  if (data !== undefined) payload.data = data;
  if (code !== undefined) payload.code = code;
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: !success,
  };
}

const ok = (message: string, data?: unknown): CallToolResult => envelope(true, message, data);
const fail = (message: string, code: string): CallToolResult => envelope(false, message, undefined, code);

export function buildMcpServer(words: WordService, blogs: BlogService, context: McpKeyContext): McpServer {
  const server = new McpServer({ name: 'drawspace-mcp', version: '1.0.0' });
  const has = (scope: McpScope) => context.scopes.includes(scope);
  const actor: ContentActor = { userId: `mcp:${context.id}`.slice(0, 36), username: `mcp:${context.name}`.slice(0, 32), role: 'mcp' };

  const run = async (scope: McpScope, fn: () => Promise<ToolOutcome>): Promise<CallToolResult> => {
    if (!has(scope)) return fail(`This key is missing the required scope: ${scope}.`, 'FORBIDDEN');
    try { const result = await fn(); return ok(result.message, result.data); }
    catch (error) {
      if (error instanceof HttpError) return fail(error.message, error.code);
      return fail('The operation failed on the server.', 'INTERNAL_ERROR');
    }
  };
  const requireConfirm = (confirm: boolean | undefined) => {
    if (confirm !== true) throw new HttpError(400, 'Explicit confirmation required. Pass confirm: true to proceed.', 'CONFIRM_REQUIRED');
  };

  server.registerTool('drawspace_list_blogs', {
    description: 'List blog articles with optional status, category, and search filters. Includes drafts (requires blogs:read).',
    inputSchema: { status: z.enum(blogStatuses).optional(), category: z.string().max(80).optional(), search: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, (args) => run('blogs:read', async () => {
    const result = await blogs.list({ status: args.status as BlogStatus | undefined, category: args.category, search: args.search, limit: args.limit, cursor: args.cursor });
    return { message: `Listed ${result.items.length} blog article(s).`, data: { blogs: result.items, pagination: { limit: args.limit ?? 25, total: result.total, nextCursor: result.nextCursor } } };
  }));

  server.registerTool('drawspace_get_blog', {
    description: 'Fetch one blog article by slug or id, including draft content (requires blogs:read).',
    inputSchema: { slug: z.string().max(80).optional(), id: z.string().max(64).optional() },
    annotations: { readOnlyHint: true },
  }, (args) => run('blogs:read', async () => {
    if (!args.slug && !args.id) throw new HttpError(400, 'Provide a slug or an id.', 'VALIDATION_ERROR');
    const record = args.id ? await blogs.get(args.id) : await blogs.getBySlug(args.slug as string, { publicOnly: false });
    return { message: 'Blog article retrieved.', data: record };
  }));

  server.registerTool('drawspace_create_blog', {
    description: 'Create a blog article. Defaults to draft. A non-draft status also requires the blogs:publish scope.',
    inputSchema: {
      title: z.string().min(1).max(255), content: z.string().min(1).max(50000),
      excerpt: z.string().max(500).optional(), slug: z.string().max(64).optional(), category: z.string().max(64).optional(),
      tags: z.array(z.string().max(40)).max(12).optional(), status: z.enum(blogStatuses).optional(), cover: z.string().max(255).optional(),
      seoTitle: z.string().max(128).optional(), seoDescription: z.string().max(255).optional(), publishAt: z.string().max(64).optional(),
    },
  }, (args) => run('blogs:create', async () => {
    const status = (args.status ?? 'draft') as BlogStatus;
    if (status !== 'draft' && !has('blogs:publish')) throw new HttpError(403, 'Creating a non-draft article requires the blogs:publish scope. Create as draft, then use drawspace_publish_blog.', 'FORBIDDEN');
    const record = await blogs.create({ title: args.title, content: args.content, excerpt: args.excerpt, slug: args.slug, category: args.category, tags: args.tags, status, cover: args.cover, seoTitle: args.seoTitle, seoDescription: args.seoDescription, publishAt: args.publishAt }, actor);
    return { message: 'Blog created successfully.', data: record };
  }));

  server.registerTool('drawspace_update_blog', {
    description: 'Update fields of an existing blog article by id (requires blogs:update).',
    inputSchema: {
      id: z.string().min(1).max(64), title: z.string().min(1).max(255).optional(), content: z.string().min(1).max(50000).optional(),
      excerpt: z.string().max(500).optional(), slug: z.string().max(64).optional(), category: z.string().max(64).optional(),
      tags: z.array(z.string().max(40)).max(12).optional(), cover: z.string().max(255).optional(),
      seoTitle: z.string().max(128).optional(), seoDescription: z.string().max(255).optional(), publishAt: z.string().max(64).optional(),
    },
  }, (args) => run('blogs:update', async () => {
    const { id, ...patch } = args;
    const record = await blogs.update(id, patch, actor);
    return { message: 'Blog updated successfully.', data: record };
  }));

  server.registerTool('drawspace_publish_blog', {
    description: 'Publish a blog article. Destructive visibility change; requires blogs:publish and confirm: true.',
    inputSchema: { id: z.string().min(1).max(64), confirm: z.boolean().optional(), publishAt: z.string().max(64).optional() },
    annotations: { destructiveHint: true },
  }, (args) => run('blogs:publish', async () => {
    requireConfirm(args.confirm);
    const record = await blogs.publish(args.id, actor, args.publishAt);
    return { message: 'Blog published successfully.', data: record };
  }));

  server.registerTool('drawspace_archive_blog', {
    description: 'Archive a blog article, hiding it from the public blog. Requires blogs:publish and confirm: true.',
    inputSchema: { id: z.string().min(1).max(64), confirm: z.boolean().optional() },
    annotations: { destructiveHint: true },
  }, (args) => run('blogs:publish', async () => {
    requireConfirm(args.confirm);
    const record = await blogs.archive(args.id, actor);
    return { message: 'Blog archived successfully.', data: record };
  }));

  server.registerTool('drawspace_delete_blog', {
    description: 'Permanently delete a blog article. Requires blogs:delete and confirm: true.',
    inputSchema: { id: z.string().min(1).max(64), confirm: z.boolean().optional() },
    annotations: { destructiveHint: true },
  }, (args) => run('blogs:delete', async () => {
    requireConfirm(args.confirm);
    await blogs.delete(args.id, actor);
    return { message: 'Blog deleted successfully.', data: { deleted: true, id: args.id } };
  }));

  server.registerTool('drawspace_list_words', {
    description: 'List word bank entries with optional category, difficulty, language, and search filters (requires words:read).',
    inputSchema: { category: z.string().max(64).optional(), difficulty: z.enum(difficulties).optional(), language: z.string().max(16).optional(), search: z.string().max(200).optional(), active: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(200).optional() },
    annotations: { readOnlyHint: true },
  }, (args) => run('words:read', async () => {
    const result = await words.list({ category: args.category, difficulty: args.difficulty as WordDifficulty | undefined, language: args.language, search: args.search, active: args.active, limit: args.limit, cursor: args.cursor });
    return { message: `Listed ${result.items.length} word(s).`, data: { words: result.items, pagination: { limit: args.limit ?? 25, total: result.total, nextCursor: result.nextCursor } } };
  }));

  server.registerTool('drawspace_add_word', {
    description: 'Add a single word to the word bank (requires words:create).',
    inputSchema: { word: z.string().min(1).max(64), category: z.string().min(1).max(64), difficulty: z.enum(difficulties), language: z.string().max(16).optional(), hint: z.string().max(300).optional(), active: z.boolean().optional() },
  }, (args) => run('words:create', async () => {
    const record = await words.create({ word: args.word, category: args.category, difficulty: args.difficulty as WordDifficulty, language: args.language, hint: args.hint, active: args.active }, actor);
    return { message: 'Word added successfully.', data: record };
  }));

  server.registerTool('drawspace_update_word', {
    description: 'Update fields of an existing word by id (requires words:update).',
    inputSchema: { id: z.string().min(1).max(64), word: z.string().min(1).max(64).optional(), category: z.string().min(1).max(64).optional(), difficulty: z.enum(difficulties).optional(), language: z.string().max(16).optional(), hint: z.string().max(300).optional(), active: z.boolean().optional() },
  }, (args) => run('words:update', async () => {
    const { id, ...patch } = args;
    const record = await words.update(id, { ...patch, difficulty: patch.difficulty as WordDifficulty | undefined }, actor);
    return { message: 'Word updated successfully.', data: record };
  }));

  server.registerTool('drawspace_delete_word', {
    description: 'Permanently delete a word by id. Requires words:delete and confirm: true.',
    inputSchema: { id: z.string().min(1).max(64), confirm: z.boolean().optional() },
    annotations: { destructiveHint: true },
  }, (args) => run('words:delete', async () => {
    requireConfirm(args.confirm);
    await words.delete(args.id, actor);
    return { message: 'Word deleted successfully.', data: { deleted: true, id: args.id } };
  }));

  server.registerTool('drawspace_bulk_add_words', {
    description: 'Add many words at once with a duplicate handling strategy (requires words:create).',
    inputSchema: {
      words: z.array(z.object({ word: z.string().min(1).max(64), category: z.string().min(1).max(64), difficulty: z.enum(difficulties), language: z.string().max(16).optional(), hint: z.string().max(300).optional(), active: z.boolean().optional() })).min(1).max(500),
      strategy: z.enum(['insert', 'skip', 'upsert']).optional(),
    },
  }, (args) => run('words:create', async () => {
    const report = await words.bulkCreate(args.words.map((word) => ({ ...word, difficulty: word.difficulty as WordDifficulty })), args.strategy ?? 'skip', actor);
    return { message: `Bulk add: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped, ${report.failed} failed.`, data: report };
  }));

  server.registerTool('drawspace_import_words', {
    description: 'Import words from validated JSON or CSV content. Use dryRun to preview. The replace strategy requires confirm: true (requires words:import).',
    inputSchema: { content: z.string().min(1).max(3_000_000), filename: z.string().max(255).optional(), format: z.enum(['json', 'csv', 'auto']).optional(), strategy: z.enum(importStrategies).optional(), dryRun: z.boolean().optional(), confirm: z.boolean().optional() },
  }, (args) => run('words:import', async () => {
    const format = args.format && args.format !== 'auto' ? args.format : detectImportFormat(args.filename, args.content);
    const parsed = parseWordsImport(args.content, format);
    const report = await words.importWords(parsed.inputs, (args.strategy ?? 'skip') as ImportStrategy, actor, { dryRun: args.dryRun ?? false, confirm: args.confirm });
    return { message: report.dryRun ? 'Word import preview complete (no changes written).' : 'Word import complete.', data: { ...report, format, warnings: [...parsed.warnings, ...report.warnings] } };
  }));

  server.registerTool('drawspace_import_blogs', {
    description: 'Import blog articles from validated JSON or CSV content. New articles default to draft. Use dryRun to preview; replace requires confirm: true (requires blogs:import).',
    inputSchema: { content: z.string().min(1).max(3_000_000), filename: z.string().max(255).optional(), format: z.enum(['json', 'csv', 'auto']).optional(), strategy: z.enum(importStrategies).optional(), dryRun: z.boolean().optional(), confirm: z.boolean().optional() },
  }, (args) => run('blogs:import', async () => {
    const format = args.format && args.format !== 'auto' ? args.format : detectImportFormat(args.filename, args.content);
    const parsed = parseBlogsImport(args.content, format);
    const report = await blogs.importBlogs(parsed.inputs, (args.strategy ?? 'skip') as ImportStrategy, actor, { dryRun: args.dryRun ?? false, confirm: args.confirm });
    return { message: report.dryRun ? 'Blog import preview complete (no changes written).' : 'Blog import complete.', data: { ...report, format, warnings: [...parsed.warnings, ...report.warnings] } };
  }));

  server.registerTool('drawspace_export_words', {
    description: 'Export the word bank as JSON or CSV, optionally filtered by category and difficulty (requires words:export).',
    inputSchema: { format: z.enum(['json', 'csv']).optional(), category: z.string().max(64).optional(), difficulty: z.enum(difficulties).optional() },
    annotations: { readOnlyHint: true },
  }, (args) => run('words:export', async () => {
    const format = args.format ?? 'json';
    const records = await collectPages((cursor) => words.list({ category: args.category, difficulty: args.difficulty as WordDifficulty | undefined, limit: 100, cursor }));
    const categories = await words.listCategories();
    const file = buildWordsExport(records, categories, format, 'all', { category: args.category, difficulty: args.difficulty });
    return { message: `Exported ${records.length} word(s) as ${format}.`, data: { filename: file.filename, contentType: file.contentType, format, count: records.length, content: file.body } };
  }));

  server.registerTool('drawspace_export_blogs', {
    description: 'Export blog articles as JSON or CSV, optionally filtered by status (requires blogs:export).',
    inputSchema: { format: z.enum(['json', 'csv']).optional(), status: z.enum(blogStatuses).optional() },
    annotations: { readOnlyHint: true },
  }, (args) => run('blogs:export', async () => {
    const format = args.format ?? 'json';
    const records = await collectPages((cursor) => blogs.list({ status: args.status as BlogStatus | undefined, limit: 100, cursor }));
    const file = buildBlogsExport(records, format, args.status ?? 'all', { status: args.status });
    return { message: `Exported ${records.length} blog article(s) as ${format}.`, data: { filename: file.filename, contentType: file.contentType, format, count: records.length, content: file.body } };
  }));

  server.registerTool('drawspace_get_blog_stats', {
    description: 'Real blog statistics computed from stored articles (requires analytics:read).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, () => run('analytics:read', async () => ({ message: 'Blog statistics retrieved.', data: await blogs.stats() })));

  server.registerTool('drawspace_get_word_stats', {
    description: 'Real word bank statistics computed from stored words (requires analytics:read).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, () => run('analytics:read', async () => ({ message: 'Word statistics retrieved.', data: await words.stats() })));

  server.registerTool('drawspace_get_content_summary', {
    description: 'Combined blog and word statistics plus category counts, all from stored data (requires analytics:read).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, () => run('analytics:read', async () => {
    const [blogStats, wordStats, wordCategories, blogCategories] = await Promise.all([blogs.stats(), words.stats(), words.listCategories(), blogs.listCategories()]);
    return { message: 'Content summary retrieved.', data: { blogs: blogStats, words: wordStats, wordCategoryCount: wordCategories.length, blogCategoryCount: blogCategories.length } };
  }));

  return server;
}

export const MCP_TOOL_NAMES = [
  'drawspace_list_blogs', 'drawspace_get_blog', 'drawspace_create_blog', 'drawspace_update_blog',
  'drawspace_publish_blog', 'drawspace_archive_blog', 'drawspace_delete_blog',
  'drawspace_list_words', 'drawspace_add_word', 'drawspace_update_word', 'drawspace_delete_word',
  'drawspace_bulk_add_words', 'drawspace_import_words', 'drawspace_import_blogs',
  'drawspace_export_words', 'drawspace_export_blogs',
  'drawspace_get_blog_stats', 'drawspace_get_word_stats', 'drawspace_get_content_summary',
] as const;