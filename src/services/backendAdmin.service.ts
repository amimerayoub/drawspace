import { apiDelete, apiGet, apiPatch, apiPut } from './apiClient';
import type { AdUnit, Article, AuditEntry, Report, SystemSettings, Word } from '@/types';

export const backendAdminService = {
  gameSettings: () => apiGet<{ maxPlayers: number; guessRateLimitPerMinute: number; chatRateLimitPerMinute: number; allowCustomWords: boolean }>('/api/admin/game-settings'),
  saveGameSettings: (settings: { maxPlayers: number; guessRateLimitPerMinute: number; chatRateLimitPerMinute: number; allowCustomWords: boolean }) => apiPut('/api/admin/game-settings', settings),
  catalog: (kind: 'avatars' | 'titles' | 'achievements' | 'challenges' | 'words', search = '') => apiGet<Record<string, unknown>[]>(`/api/admin/catalog/${kind}?search=${encodeURIComponent(search)}`),
  saveCatalogItem: (kind: 'avatars' | 'titles' | 'achievements' | 'challenges' | 'words', id: string, values: Record<string, unknown>) => apiPut<Record<string, unknown>>(`/api/admin/catalog/${kind}/${encodeURIComponent(id)}`, values),
  deleteCatalogItem: (kind: 'avatars' | 'titles' | 'achievements' | 'challenges' | 'words', id: string) => apiDelete<{ deleted: boolean }>(`/api/admin/catalog/${kind}/${encodeURIComponent(id)}`),
  users: (options: { search?: string; status?: string; role?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams(Object.entries(options).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)]));
    return apiGet<{ users: import('@/types').User[]; total: number }>(`/api/admin/users?${query}`);
  },
  user: (id: string) => apiGet<import('@/types').User>(`/api/admin/users/${encodeURIComponent(id)}`),
  updateUser: (id: string, patch: { username?: string; bio?: string; avatarId?: string }) => apiPatch(`/api/admin/users/${encodeURIComponent(id)}`, patch),
  setUserStatus: (id: string, status: string, reason: string) => apiPatch(`/api/admin/users/${encodeURIComponent(id)}/status`, { status, reason }),
  setUserRole: (id: string, role: string | null, reason: string) => apiPatch(`/api/admin/users/${encodeURIComponent(id)}/role`, { role, reason }),
  reports: (status: string) => apiGet<Report[]>(`/api/admin/reports?status=${encodeURIComponent(status)}`),
  resolveReport: (id: string, status: 'resolved' | 'dismissed', reason: string) => apiPatch<{ id: string; status: string }>(`/api/admin/reports/${encodeURIComponent(id)}`, { status, reason }),
  publicArticles: () => apiGet<Article[]>('/api/blog', { auth: 'none' }),
  publicArticle: (slug: string) => apiGet<Article>(`/api/blog/${encodeURIComponent(slug)}`, { auth: 'none' }),
  activeAd: (placement: 'landing' | 'blog') => apiGet<{ id: string; name: string; body: string; placement: string } | null>(`/api/ads/${placement}`, { auth: 'none' }),
  words: () => apiGet<Word[]>('/api/admin/content/words'),
  saveWord: (word: Word) => apiPut<Word>(`/api/admin/content/words/${encodeURIComponent(word.id)}`, { text: word.text, difficulty: word.difficulty, category: word.category, active: word.active }),
  deleteWord: (id: string) => apiDelete<{ deleted: boolean }>(`/api/admin/content/words/${encodeURIComponent(id)}`),
  adminArticles: () => apiGet<Article[]>('/api/admin/content/blog'),
  saveArticle: (article: Article) => apiPut<Article>(`/api/admin/content/blog/${encodeURIComponent(article.id)}`, { slug: article.slug, title: article.title, excerpt: article.excerpt, body: article.body, category: article.category, status: article.status, cover: article.cover, seoTitle: article.seoTitle, seoDescription: article.seoDescription, publishAt: article.publishAt }),
  deleteArticle: (id: string) => apiDelete<{ deleted: boolean }>(`/api/admin/content/blog/${encodeURIComponent(id)}`),
  ads: () => apiGet<AdUnit[]>('/api/admin/content/ads'),
  saveAd: (ad: AdUnit) => apiPut<AdUnit>(`/api/admin/content/ads/${encodeURIComponent(ad.id)}`, { name: ad.name, placement: ad.placement, enabled: ad.enabled, startDate: ad.startDate, endDate: ad.endDate, priority: ad.priority, body: ad.body }),
  deleteAd: (id: string) => apiDelete<{ deleted: boolean }>(`/api/admin/content/ads/${encodeURIComponent(id)}`),
  settings: () => apiGet<Pick<SystemSettings, 'siteName' | 'tagline' | 'contactEmail' | 'defaultLocale' | 'maintenance' | 'registrationOpen' | 'guestPlay'>>('/api/admin/content/settings'),
  saveSettings: (settings: Pick<SystemSettings, 'siteName' | 'tagline' | 'contactEmail' | 'defaultLocale' | 'maintenance' | 'registrationOpen' | 'guestPlay'>) => apiPut('/api/admin/content/settings', settings),
  audit: () => apiGet<AuditEntry[]>('/api/admin/content/audit'),
};
