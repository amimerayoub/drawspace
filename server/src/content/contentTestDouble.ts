import type { AppwriteDatabase } from '../database/appwrite';

const WORD_CORE_COLUMNS = ['id', 'word', 'category', 'difficulty', 'isActive'];
const WORD_MIGRATED_COLUMNS = [...WORD_CORE_COLUMNS, 'language', 'hint', 'normalizedWord', 'createdAt', 'updatedAt'];
const POST_CORE_COLUMNS = ['id', 'slug', 'title', 'excerpt', 'content', 'categoryId', 'status', 'featuredImage', 'seoTitle', 'seoDescription', 'publishedAt', 'authorId', 'authorName', 'views', 'createdAt', 'updatedAt'];
const POST_MIGRATED_COLUMNS = [...POST_CORE_COLUMNS, 'tags'];

export interface ContentDoubleOptions { migrated?: boolean; withWordCategories?: boolean }

export function createContentDouble(options: ContentDoubleOptions = {}) {
  const dbRows = new Map<string, Map<string, Record<string, unknown>>>();
  let next = 0;
  const notFound = () => Object.assign(new Error('Table not found'), { code: 404 });
  const tables = {
    async listRows(_db: string, table: string) {
      if (table === 'word_categories' && !options.withWordCategories) throw notFound();
      return { rows: [...(dbRows.get(table)?.values() || [])], total: dbRows.get(table)?.size || 0 };
    },
    async createRow(_db: string, table: string, id: string, data: Record<string, unknown>) {
      const row = { $id: id, $createdAt: new Date().toISOString(), $updatedAt: new Date().toISOString(), ...data };
      const rows = dbRows.get(table) || new Map();
      rows.set(row.$id, row);
      dbRows.set(table, rows);
      return row;
    },
    async updateRow(_db: string, table: string, id: string, data: Record<string, unknown>) {
      const rows = dbRows.get(table);
      const before = rows?.get(id);
      if (!before) throw notFound();
      const row = { ...before, ...data, $updatedAt: new Date().toISOString() };
      rows!.set(id, row);
      return row;
    },
    async deleteRow(_db: string, table: string, id: string) {
      dbRows.get(table)?.delete(id);
      return {};
    },
    async listColumns(_db: string, table: string) {
      if (table === 'custom_words') return { columns: (options.migrated ? WORD_MIGRATED_COLUMNS : WORD_CORE_COLUMNS).map((key) => ({ key })) };
      if (table === 'blog_posts') return { columns: (options.migrated ? POST_MIGRATED_COLUMNS : POST_CORE_COLUMNS).map((key) => ({ key })) };
      throw notFound();
    },
  };
  const database = { databaseId: 'test', tables, newId: () => `new-${++next}` } as unknown as AppwriteDatabase;
  return { database, rows: dbRows };
}

export const testActor = { userId: 'admin-1', username: 'Admin', role: 'admin' };