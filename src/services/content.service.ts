import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from './apiClient';

export type ContentDifficulty = 'easy' | 'medium' | 'hard';
export type ContentBlogStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export interface ContentWord { id: string; word: string; category: string; difficulty: ContentDifficulty; language: string; hint: string; active: boolean; createdAt: string; updatedAt: string }
export interface ContentBlog { id: string; slug: string; title: string; excerpt: string; content: string; studioDoc?: string; category: string; tags: string[]; status: ContentBlogStatus; cover: string; author: string; seoTitle: string; seoDescription: string; publishedAt: string; createdAt: string; updatedAt: string; views: number }
export interface WordStats { total: number; active: number; inactive: number; byCategory: Record<string, number>; byDifficulty: Record<string, number>; byLanguage: Record<string, number> }
export interface BlogStats { total: number; published: number; draft: number; scheduled: number; archived: number; totalViews: number; mostViewed: ContentBlog[]; recent: ContentBlog[] }
export interface WordCategory { id: string; name: string; slug: string; wordCount: number }
export interface BlogCategory { id: string; name: string; slug: string; postCount: number }
export interface WordInput { word: string; category: string; difficulty: ContentDifficulty; language?: string; hint?: string; active?: boolean }
export interface BlogInput { title: string; slug?: string; excerpt?: string; content: string; category?: string; tags?: string[]; status?: ContentBlogStatus; cover?: string; seoTitle?: string; seoDescription?: string; publishAt?: string }
export interface BulkWordResult { index: number; word: string; status: 'created' | 'updated' | 'skipped' | 'failed'; id?: string; error?: string }
export interface BulkReport { results: BulkWordResult[]; created: number; updated: number; skipped: number; failed: number }
export type BulkStrategy = 'insert' | 'skip' | 'upsert';
export type ImportStrategy = BulkStrategy | 'replace';
export interface ImportRecordResult { index: number; word?: string; title?: string; slug?: string; status: 'created' | 'updated' | 'skipped' | 'failed'; id?: string; error?: string }
export interface ImportReport { results: ImportRecordResult[]; created: number; updated: number; skipped: number; failed: number; dryRun: boolean; warnings: string[]; format: 'json' | 'csv' }
export interface ImportPayload { content: string; filename?: string; format?: 'json' | 'csv' | 'auto'; strategy: ImportStrategy; dryRun?: boolean; confirm?: boolean }
export type ExportFormat = 'json' | 'csv';

interface Paged<T> { data: T[]; pagination: { limit: number; total: number; nextCursor: string | null } }
export interface WordListQuery { search?: string; category?: string; difficulty?: ContentDifficulty; language?: string; active?: boolean; sort?: string; order?: 'asc' | 'desc'; limit?: number; cursor?: string }
export interface BlogListQuery { search?: string; status?: ContentBlogStatus; category?: string; tag?: string; sort?: string; order?: 'asc' | 'desc'; limit?: number; cursor?: string }

const query = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
};

async function fetchAll<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result: Paged<T> = await apiGet<Paged<T>>(`${path}${query({ ...params, limit: 100, cursor })}`, { raw: true });
    items.push(...result.data);
    if (!result.pagination.nextCursor) break;
    cursor = result.pagination.nextCursor;
  }
  return items;
}

export const contentService = {
  words: (params: WordListQuery = {}) => fetchAll<ContentWord>('/api/v1/admin/words', { ...params }),
  wordStats: () => apiGet<WordStats>('/api/v1/admin/words/stats'),
  createWord: (input: WordInput) => apiPost<ContentWord>('/api/v1/admin/words', input),
  updateWord: (id: string, patch: Partial<WordInput>) => apiPatch<ContentWord>(`/api/v1/admin/words/${encodeURIComponent(id)}`, patch),
  deleteWord: (id: string) => apiDelete<{ deleted: boolean }>(`/api/v1/admin/words/${encodeURIComponent(id)}`, { confirm: true }),
  bulkWords: (words: WordInput[], strategy: BulkStrategy) => apiPost<BulkReport>('/api/v1/admin/words/bulk', { words, strategy }),
  bulkActive: (ids: string[], active: boolean) => apiPost<{ updated: string[]; notFound: string[] }>('/api/v1/admin/words/bulk-active', { ids, active, confirm: true }),
  bulkDeleteWords: (ids: string[]) => apiPost<{ deleted: string[]; notFound: string[] }>('/api/v1/admin/words/bulk-delete', { ids, confirm: true }),
  wordCategories: () => apiGet<WordCategory[]>('/api/v1/admin/words/categories'),
  createWordCategory: (name: string) => apiPost<WordCategory>('/api/v1/admin/words/categories', { name }),
  renameWordCategory: (id: string, name: string) => apiPatch<WordCategory>(`/api/v1/admin/words/categories/${encodeURIComponent(id)}`, { name }),
  deleteWordCategory: (id: string, reassignTo?: string) => apiDelete<{ deleted: boolean; reassigned: number }>(`/api/v1/admin/words/categories/${encodeURIComponent(id)}`, { confirm: true, reassignTo }),

  blogs: (params: BlogListQuery = {}) => fetchAll<ContentBlog>('/api/v1/admin/blogs', { ...params }),
  blogStats: () => apiGet<BlogStats>('/api/v1/admin/blogs/stats'),
  blog: (id: string) => apiGet<ContentBlog>(`/api/v1/admin/blogs/${encodeURIComponent(id)}`),
  createBlog: (input: BlogInput) => apiPost<ContentBlog>('/api/v1/admin/blogs', input),
  updateBlog: (id: string, patch: Partial<BlogInput>) => apiPatch<ContentBlog>(`/api/v1/admin/blogs/${encodeURIComponent(id)}`, patch),
  deleteBlog: (id: string) => apiDelete<{ deleted: boolean }>(`/api/v1/admin/blogs/${encodeURIComponent(id)}`, { confirm: true }),
  publishBlog: (id: string) => apiPost<ContentBlog>(`/api/v1/admin/blogs/${encodeURIComponent(id)}/publish`, { confirm: true }),
  archiveBlog: (id: string) => apiPost<ContentBlog>(`/api/v1/admin/blogs/${encodeURIComponent(id)}/archive`, { confirm: true }),
  unpublishBlog: (id: string) => apiPost<ContentBlog>(`/api/v1/admin/blogs/${encodeURIComponent(id)}/unpublish`, { confirm: true }),
  blogCategories: () => apiGet<BlogCategory[]>('/api/v1/admin/blogs/categories'),

  publicBlogs: (params: BlogListQuery = {}) => apiGet<{ success: boolean; data: ContentBlog[]; pagination: { limit: number; total: number; nextCursor: string | null } }>(`/api/v1/public/blogs${query({ ...params })}`, { auth: 'none', raw: true }),
  publicBlog: (slug: string) => apiGet<{ data: ContentBlog; related: ContentBlog[] }>(`/api/v1/blogs/${encodeURIComponent(slug)}`, { auth: 'none', raw: true }),

  importWords: (payload: ImportPayload) => apiPost<ImportReport>('/api/v1/admin/import/words', payload, { timeoutMs: 120_000 }),
  importBlogs: (payload: ImportPayload) => apiPost<ImportReport>('/api/v1/admin/import/blogs', payload, { timeoutMs: 120_000 }),
  exportWords: (params: { format: ExportFormat; category?: string; difficulty?: string; active?: boolean; ids?: string[] }) => apiDownload(`/api/v1/admin/export/words${query({ ...params, ids: params.ids?.join(',') })}`),
  exportBlogs: (params: { format: ExportFormat; scope?: 'all' | 'published' | 'draft' | 'selected'; category?: string; ids?: string[] }) => apiDownload(`/api/v1/admin/export/blogs${query({ ...params, ids: params.ids?.join(',') })}`),
  exportCategories: (format: ExportFormat) => apiDownload(`/api/v1/admin/export/categories${query({ format })}`),
};

export function normalizeWordText(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}