import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { HttpError } from '../middleware/errors';
import { RowRepository, type Row } from '../repositories/rowRepository';
import type { ContentActor } from './wordService';
import { prepareStudio, STUDIO_DOC_MAX, STUDIO_SENTINEL } from './studioContent';

export interface TemplateRecord { id: string; name: string; description: string; doc: string; createdBy: string; createdAt: string }
export interface TemplateInput { name: string; description?: string; doc: string }

const MAX_TEMPLATES = 50;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) return true;
  }
  return false;
}

function toRecord(row: Row): TemplateRecord {
  return {
    id: String(row.id ?? row.$id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    doc: String(row.doc ?? ''),
    createdBy: String(row.createdBy ?? ''),
    createdAt: String(row.createdAt || row.$createdAt || ''),
  };
}

/* Saved studio templates. Backed by the optional blog_templates table; when the
   table is absent the API reports unavailable so the client falls back to local
   storage. Documents are sanitized and role-gated exactly like posts. */
export class TemplateService {
  private readonly templates: RowRepository;
  private readonly audit: RowRepository;
  private available?: Promise<boolean>;

  constructor(private readonly database: AppwriteDatabase) {
    this.templates = new RowRepository(database, 'blog_templates');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  private availability(): Promise<boolean> {
    if (!this.available) {
      this.available = this.database.tables.listColumns(this.database.databaseId, 'blog_templates', [])
        .then(() => true)
        .catch(() => false);
    }
    return this.available;
  }

  async isAvailable(): Promise<boolean> {
    return this.availability();
  }

  private async requireAvailable(): Promise<void> {
    if (!(await this.availability())) throw new HttpError(503, 'Template storage is not available yet. Run the blog studio migration to enable it.', 'TEMPLATES_UNAVAILABLE');
  }

  async list(): Promise<TemplateRecord[]> {
    if (!(await this.availability())) return [];
    const rows = await this.templates.list([Query.limit(MAX_TEMPLATES)]);
    return rows.map(toRecord).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async create(input: TemplateInput, actor: ContentActor): Promise<TemplateRecord> {
    await this.requireAvailable();
    const name = String(input.name ?? '').trim();
    if (name.length < 1 || name.length > 64 || hasControlChars(name) || /[<>]/.test(name)) throw new HttpError(400, 'Template name must be 1 to 64 characters without markup.', 'VALIDATION_ERROR');
    const description = String(input.description ?? '').trim();
    if (description.length > 255 || hasControlChars(description)) throw new HttpError(400, 'Template description must be at most 255 characters.', 'VALIDATION_ERROR');
    const doc = String(input.doc ?? '');
    if (!doc.startsWith(STUDIO_SENTINEL)) throw new HttpError(400, 'Template document must be a studio document.', 'VALIDATION_ERROR');
    if (doc.length > STUDIO_DOC_MAX) throw new HttpError(400, 'The template document is too large to store.', 'VALIDATION_ERROR');
    const prepared = prepareStudio(doc, actor.role);
    const rows = await this.templates.list([Query.limit(MAX_TEMPLATES)]);
    if (rows.length >= MAX_TEMPLATES) throw new HttpError(400, `The template library is full (${MAX_TEMPLATES}). Delete a template first.`, 'TEMPLATE_LIMIT');
    if (rows.some((row) => String(row.name ?? '').toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'A template with this name already exists.', 'TEMPLATE_DUPLICATE');
    const row = await this.templates.insert({
      id: randomUUID().replaceAll('-', '').slice(0, 32), name, description, doc: prepared.serialized,
      createdBy: actor.username.slice(0, 64), createdAt: new Date().toISOString(),
    });
    await this.writeAudit(actor, 'blog_template.create', 'blog_template', String(row.id ?? row.$id), name);
    return toRecord(row);
  }

  async delete(id: string, actor: ContentActor): Promise<void> {
    await this.requireAvailable();
    const rows = await this.templates.list([Query.limit(MAX_TEMPLATES)]);
    const existing = rows.find((row) => String(row.id ?? row.$id) === id);
    if (!existing) throw new HttpError(404, 'Template not found.', 'TEMPLATE_NOT_FOUND');
    await this.templates.delete(existing.$id);
    await this.writeAudit(actor, 'blog_template.delete', 'blog_template', id, String(existing.name ?? ''));
  }

  private async writeAudit(actor: ContentActor, action: string, resourceType: string, resourceId: string, reason: string): Promise<void> {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}