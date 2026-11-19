import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';
import { invalidateWords } from './wordRepository';
import { prepareStudio } from '../content/studioContent';

type Actor = { userId: string; username: string; role: string };
export interface PublicPlatformConfig {
  siteName: string; tagline: string; contactEmail: string; defaultLocale: string;
  maintenance: boolean; registrationOpen: boolean; guestPlay: boolean;
  logoUrl: string; faviconUrl: string; announcement: string; seoTitle: string; seoDescription: string;
  gaMeasurementId: string; gtmContainerId: string;
  updatedAt: string | null;
}
export class AdminDataRepository {
  private readonly words: RowRepository;
  private readonly posts: RowRepository;
  private readonly categories: RowRepository;
  private readonly ads: RowRepository;
  private readonly settings: RowRepository;
  private readonly audit: RowRepository;
  private publicConfigCache: { value: PublicPlatformConfig; at: number } | null = null;
  constructor(private readonly database: AppwriteDatabase) {
    this.words = new RowRepository(database, 'custom_words'); this.posts = new RowRepository(database, 'blog_posts');
    this.categories = new RowRepository(database, 'blog_categories'); this.ads = new RowRepository(database, 'advertisements');
    this.settings = new RowRepository(database, 'platform_settings'); this.audit = new RowRepository(database, 'audit_logs');
  }

  async listWords() {
    return (await this.words.list([Query.limit(500)])).map((row) => ({ id: String(row.id), text: String(row.word), difficulty: String(row.difficulty), category: String(row.category), definition: '', hint: '', active: Boolean(row.isActive), translations: {} }));
  }
  async saveWord(input: { id: string; text: string; difficulty: string; category: string; active: boolean }, actor: Actor) {
    const existing = await this.words.findOne('id', input.id);
    const duplicate = await this.words.findOne('word', input.text.trim().toLocaleLowerCase());
    if (duplicate && duplicate.$id !== existing?.$id) throw new Error('This word already exists.');
    const data = { id: input.id, word: input.text, difficulty: input.difficulty, category: input.category, isActive: input.active };
    if (existing) await this.words.patch(existing.$id, data); else await this.words.insert(data);
    invalidateWords();
    await this.writeAudit(actor, existing ? 'word.update' : 'word.create', 'custom_word', input.id, `${input.text} (${input.difficulty})`);
    return input;
  }
  async deleteWord(id: string, actor: Actor) { const row = await this.words.findOne('id', id); if (!row) throw new Error('Word not found.'); await this.words.delete(row.$id); invalidateWords(); await this.writeAudit(actor, 'word.delete', 'custom_word', id, 'deleted'); }

  async listPosts(includeDrafts: boolean) {
    const rows = await this.posts.list([Query.limit(500)]);
    const categories = await this.categories.list([Query.limit(200)]);
    const categoryById = new Map(categories.map((row) => [String(row.id), String(row.name)]));
    return rows.filter((row) => includeDrafts || row.status === 'published' || (row.status === 'scheduled' && Date.parse(String(row.publishedAt)) <= Date.now())).map((row) => ({ id: String(row.id), slug: String(row.slug), title: String(row.title), excerpt: String(row.excerpt), body: String(row.content).split(/\n\s*\n/).filter(Boolean), category: categoryById.get(String(row.categoryId)) || 'News', tags: [], status: String(row.status), author: String(row.authorName), cover: String(row.featuredImage || ''), createdAt: String(row.createdAt), publishAt: String(row.publishedAt), seoTitle: String(row.seoTitle || ''), seoDescription: String(row.seoDescription || ''), views: Number(row.views) || 0 }));
  }
  async savePost(input: { id: string; slug: string; title: string; excerpt: string; content: string; category: string; status: string; cover: string; seoTitle: string; seoDescription: string; publishAt: string }, actor: Actor) {
    const existing = await this.posts.findOne('id', input.id);
    const category = await this.getOrCreateCategory(input.category);
    const now = new Date().toISOString();
    const content = prepareStudio(input.content, actor.role).serialized;
    const data = { id: input.id, slug: input.slug, title: input.title, excerpt: input.excerpt, content, categoryId: String(category.id), status: input.status, featuredImage: input.cover, seoTitle: input.seoTitle, seoDescription: input.seoDescription, publishedAt: input.publishAt || '', authorId: actor.userId, authorName: actor.username.slice(0, 64), views: Number(existing?.views) || 0, createdAt: String(existing?.createdAt || now), updatedAt: now };
    if (existing) await this.posts.patch(existing.$id, data); else await this.posts.insert(data);
    await this.writeAudit(actor, existing ? 'blog.update' : 'blog.create', 'blog_post', input.id, input.status);
    return input;
  }
  async deletePost(id: string, actor: Actor) { const row = await this.posts.findOne('id', id); if (!row) throw new Error('Blog post not found.'); await this.posts.delete(row.$id); await this.writeAudit(actor, 'blog.delete', 'blog_post', id, 'deleted'); }

  async listAds() {
    return (await this.ads.list([Query.limit(500)])).map((row) => ({ id: String(row.id), name: String(row.name), placement: String(row.placement), enabled: row.status === 'active', devices: ['desktop', 'mobile', 'tablet'], startDate: String(row.startAt || '').slice(0, 10), endDate: String(row.endAt || '').slice(0, 10), priority: Number(row.priority) || 0, body: String(row.description || '') }));
  }
  async activeAd(placement: string) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.ads.list([Query.equal('placement', placement), Query.equal('status', 'active'), Query.limit(200)]);
    const row = rows.filter((item) => String(item.startAt || '') <= today && String(item.endAt || '') >= today).sort((a, b) => Number(a.priority) - Number(b.priority))[0];
    return row ? { id: String(row.id), name: String(row.name), body: String(row.description || ''), placement: String(row.placement) } : null;
  }
  async saveAd(input: { id: string; name: string; placement: string; enabled: boolean; startDate: string; endDate: string; priority: number; body: string }, actor: Actor) {
    const existing = await this.ads.findOne('id', input.id);
    const now = new Date().toISOString();
    const data = { id: input.id, name: input.name, placement: input.placement, status: input.enabled ? 'active' : 'paused', startAt: input.startDate, endAt: input.endDate, priority: input.priority, description: input.body, headline: input.name, creativeType: 'text', destinationUrl: '', imagePath: '', clicks: Number(existing?.clicks) || 0, impressions: Number(existing?.impressions) || 0, createdAt: String(existing?.createdAt || now), updatedAt: now };
    if (existing) await this.ads.patch(existing.$id, data); else await this.ads.insert(data);
    await this.writeAudit(actor, existing ? 'advertisement.update' : 'advertisement.create', 'advertisement', input.id, input.enabled ? 'active' : 'paused');
  }
  async deleteAd(id: string, actor: Actor) { const row = await this.ads.findOne('id', id); if (!row) throw new Error('Advertisement not found.'); await this.ads.delete(row.$id); await this.writeAudit(actor, 'advertisement.delete', 'advertisement', id, 'deleted'); }

  async getSettings() {
    const row = (await this.settings.list([Query.limit(1)]))[0];
    if (!row) return null;
    return { siteName: String(row.platformName), tagline: String(row.platformDescription), contactEmail: String(row.publicSupportEmail), defaultLocale: String(row.defaultLanguage), maintenance: Boolean(row.maintenanceMode), registrationOpen: Boolean(row.registrationEnabled), guestPlay: Boolean(row.guestAccessEnabled), gaMeasurementId: String(row.gaMeasurementId || ''), gtmContainerId: String(row.gtmContainerId || ''), maxRoomCapacity: Number(row.maxRoomCapacity), allowCustomWords: Boolean(row.allowCustomWords) };
  }
  async getPublicConfig(): Promise<PublicPlatformConfig> {
    if (this.publicConfigCache && Date.now() - this.publicConfigCache.at < 30_000) return this.publicConfigCache.value;
    const row = (await this.settings.list([Query.limit(1)]))[0];
    const value: PublicPlatformConfig = {
      siteName: String(row?.platformName || 'DrawSpace'),
      tagline: String(row?.platformDescription || ''),
      contactEmail: String(row?.publicSupportEmail || 'hello@drawspace.cloud'),
      defaultLocale: String(row?.defaultLanguage || 'en'),
      maintenance: Boolean(row?.maintenanceMode),
      registrationOpen: row?.registrationEnabled !== false,
      guestPlay: row?.guestAccessEnabled !== false,
      logoUrl: String(row?.logoUrl || ''),
      faviconUrl: String(row?.faviconUrl || ''),
      announcement: String(row?.announcement || ''),
      seoTitle: String(row?.seoTitle || ''),
      seoDescription: String(row?.seoDescription || ''),
      gaMeasurementId: String(row?.gaMeasurementId || ''),
      gtmContainerId: String(row?.gtmContainerId || ''),
      updatedAt: row?.updatedAt ? String(row.updatedAt) : null,
    };
    this.publicConfigCache = { value, at: Date.now() };
    return value;
  }
  async updateSettings(input: { siteName: string; tagline: string; contactEmail: string; defaultLocale: string; maintenance: boolean; registrationOpen: boolean; guestPlay: boolean; gaMeasurementId: string; gtmContainerId: string }, actor: Actor) {
    const row = (await this.settings.list([Query.limit(1)]))[0];
    const data = { platformName: input.siteName, platformDescription: input.tagline, publicSupportEmail: input.contactEmail, defaultLanguage: input.defaultLocale, maintenanceMode: input.maintenance, registrationEnabled: input.registrationOpen, guestAccessEnabled: input.guestPlay, gaMeasurementId: input.gaMeasurementId, gtmContainerId: input.gtmContainerId, updatedAt: new Date().toISOString(), updatedBy: actor.userId };
    if (row) await this.settings.patch(row.$id, data); else await this.settings.insert({ ...data, maxRoomCapacity: 12, guessRateLimitPerMinute: 30, chatRateLimitPerMinute: 30, emailVerificationRequired: false, allowCustomWords: true });
    this.publicConfigCache = null;
    await this.writeAudit(actor, 'platform_settings.update', 'platform_settings', 'singleton', 'updated');
    return input;
  }

  async listAudit() {
    return (await this.audit.list([Query.orderDesc('createdAt'), Query.limit(500)])).map((row) => ({ id: String(row.id), admin: String(row.actorUsername), action: String(row.action), target: String(row.resourceId), at: String(row.createdAt), before: '', after: String(row.reason || ''), status: String(row.status || 'success') }));
  }
  private async getOrCreateCategory(name: string): Promise<Row> {
    const clean = name.trim().slice(0, 64) || 'News';
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'news';
    const existing = await this.categories.findOne('slug', slug);
    if (existing) return existing;
    return this.categories.insert({ id: randomUUID().replaceAll('-', ''), name: clean, slug, description: '', isActive: true });
  }
  private async writeAudit(actor: Actor, action: string, resourceType: string, resourceId: string, reason: string) {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}
