import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export interface SeoRecordInput {
  route: string; title: string; description: string; canonical: string;
  ogTitle: string; ogDescription: string; robots: 'index' | 'noindex'; structuredData: string;
}
export interface RedirectRuleInput { id: string; from: string; to: string; code: 301 | 302; hits: number }
type Actor = { userId: string; username: string; role: string };

export class SeoRepository {
  private readonly seo: RowRepository;
  private readonly redirects: RowRepository;
  private readonly audit: RowRepository;
  constructor(private readonly database: AppwriteDatabase) {
    this.seo = new RowRepository(database, 'seo_records');
    this.redirects = new RowRepository(database, 'redirect_rules');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  async listSeo(): Promise<SeoRecordInput[]> {
    const rows = await this.safeList(this.seo);
    return rows.map((row) => this.toSeo(row)).sort((a, b) => a.route.localeCompare(b.route));
  }
  async saveSeo(input: SeoRecordInput, actor: Actor): Promise<SeoRecordInput> {
    const existing = await this.seo.findOne('route', input.route);
    const data = { route: input.route, title: input.title, description: input.description, canonical: input.canonical, ogTitle: input.ogTitle, ogDescription: input.ogDescription, robots: input.robots, structuredData: input.structuredData, updatedAt: new Date().toISOString() };
    if (existing) await this.seo.patch(existing.$id, data); else await this.seo.insert(data);
    await this.writeAudit(actor, existing ? 'seo.update' : 'seo.create', 'seo_record', input.route, input.robots);
    return input;
  }
  async deleteSeo(route: string, actor: Actor): Promise<void> {
    const existing = await this.seo.findOne('route', route);
    if (!existing) throw new Error('SEO record not found.');
    await this.seo.delete(existing.$id);
    await this.writeAudit(actor, 'seo.delete', 'seo_record', route, 'deleted');
  }

  async listRedirects(): Promise<RedirectRuleInput[]> {
    const rows = await this.safeList(this.redirects);
    return rows.map((row) => this.toRedirect(row)).sort((a, b) => a.from.localeCompare(b.from));
  }
  async saveRedirect(input: RedirectRuleInput, actor: Actor): Promise<RedirectRuleInput> {
    const existing = input.id ? await this.redirects.findOne('id', input.id) : null;
    const duplicate = await this.redirects.findOne('fromPath', input.from);
    if (duplicate && duplicate.$id !== existing?.$id) throw new Error('A redirect from this path already exists.');
    const id = existing ? String(existing.id) : input.id || `rd_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const data = { id, fromPath: input.from, toPath: input.to, code: input.code, hits: Number(existing?.hits) || 0, updatedAt: new Date().toISOString() };
    if (existing) await this.redirects.patch(existing.$id, data); else await this.redirects.insert(data);
    await this.writeAudit(actor, existing ? 'redirect.update' : 'redirect.create', 'redirect_rule', id, `${input.from} -> ${input.to}`);
    return { ...input, id, hits: data.hits };
  }
  async deleteRedirect(id: string, actor: Actor): Promise<void> {
    const existing = await this.redirects.findOne('id', id);
    if (!existing) throw new Error('Redirect not found.');
    await this.redirects.delete(existing.$id);
    await this.writeAudit(actor, 'redirect.delete', 'redirect_rule', id, 'deleted');
  }

  async robotsTxt(siteUrl: string): Promise<string> {
    const records = await this.listSeo();
    const disallowed = records.filter((record) => record.robots === 'noindex').map((record) => record.route);
    const lines = ['User-agent: *', disallowed.length ? `Disallow: ${disallowed.join(', ')}` : 'Allow: /', `Sitemap: ${siteUrl}/sitemap.xml`];
    return lines.join('\n');
  }
  async sitemapXml(siteUrl: string): Promise<string> {
    const records = await this.listSeo();
    const urls = records.filter((record) => record.robots === 'index').map((record) => record.canonical || `${siteUrl}${record.route}`);
    const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
  }

  private toSeo(row: Row): SeoRecordInput {
    return { route: String(row.route), title: String(row.title || ''), description: String(row.description || ''), canonical: String(row.canonical || ''), ogTitle: String(row.ogTitle || ''), ogDescription: String(row.ogDescription || ''), robots: row.robots === 'noindex' ? 'noindex' : 'index', structuredData: String(row.structuredData || '') };
  }
  private toRedirect(row: Row): RedirectRuleInput {
    return { id: String(row.id), from: String(row.fromPath), to: String(row.toPath), code: Number(row.code) === 302 ? 302 : 301, hits: Number(row.hits) || 0 };
  }
  private async safeList(repo: RowRepository): Promise<Row[]> {
    try { return await repo.list([Query.limit(500)]); } catch { return []; }
  }
  private async writeAudit(actor: Actor, action: string, resourceType: string, resourceId: string, reason: string) {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] as string));
}