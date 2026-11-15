/* Saved studio templates: server-backed when the blog_templates table exists,
   localStorage fallback otherwise (pre-migration). */
import { ApiError, apiDelete, apiGet, apiPost } from './apiClient';
import type { StudioDoc } from '@/studio/types';

export interface StoredTemplate { id: string; name: string; description: string; doc: StudioDoc; createdAt: string; source: 'server' | 'local' }
interface ServerTemplate { id: string; name: string; description: string; doc: StudioDoc; createdAt: string }

const LS_KEY = 'drawspace.studio.templates.v1';
const readLocal = (): StoredTemplate[] => {
  try { const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as StoredTemplate[]; return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};
const writeLocal = (list: StoredTemplate[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* storage full or blocked */ } };
const unavailable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status === 503);

export const templateService = {
  async list(): Promise<StoredTemplate[]> {
    try {
      const server = await apiGet<ServerTemplate[]>('/api/v1/admin/blog-templates');
      return server.map((t) => ({ ...t, source: 'server' as const }));
    } catch (e) {
      if (unavailable(e)) return readLocal();
      throw e;
    }
  },
  async save(name: string, description: string, doc: StudioDoc): Promise<StoredTemplate> {
    try {
      const saved = await apiPost<ServerTemplate>('/api/v1/admin/blog-templates', { name, description, doc });
      return { ...saved, source: 'server' };
    } catch (e) {
      if (!unavailable(e)) throw e;
      const local: StoredTemplate = { id: `local_${Date.now().toString(36)}`, name, description, doc, createdAt: new Date().toISOString(), source: 'local' };
      writeLocal([...readLocal(), local]);
      return local;
    }
  },
  async remove(template: StoredTemplate): Promise<void> {
    if (template.source === 'server') await apiDelete(`/api/v1/admin/blog-templates/${encodeURIComponent(template.id)}`, { confirm: true });
    else writeLocal(readLocal().filter((t) => t.id !== template.id));
  },
};