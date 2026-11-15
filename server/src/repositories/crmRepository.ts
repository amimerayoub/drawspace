import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export const CRM_SEGMENTS = ['All players', 'Inactive 30 days', 'Level 10+', 'New this week', 'Guests'] as const;
export type CrmSegment = (typeof CRM_SEGMENTS)[number];

export interface CrmCampaign { id: string; segment: string; subject: string; body: string; sentAt: string; recipients: number; status: 'sent' | 'draft' }
export interface CrmSegmentCount { segment: string; count: number }
export interface CrmCampaignInput { id?: string; segment: string; subject: string; body: string; status: 'sent' | 'draft' }
type Actor = { userId: string; username: string; role: string };

const DAY_MS = 86_400_000;
const MAX_ROWS = 5000;

// Campaigns are persisted with live audience sizes computed from existing player
// tables. No email or push provider is connected, so "sent" records a finalized
// campaign and its audience; it does not claim external delivery.
export class CrmRepository {
  private readonly campaigns: RowRepository;
  private readonly audit: RowRepository;
  constructor(private readonly database: AppwriteDatabase) {
    this.campaigns = new RowRepository(database, 'crm_messages');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  async list(): Promise<CrmCampaign[]> {
    const rows = await this.safeList(this.campaigns);
    return rows.map((row) => this.toCampaign(row)).sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || '') || a.subject.localeCompare(b.subject));
  }

  async segments(): Promise<CrmSegmentCount[]> {
    const [profiles, progressions, statistics] = await Promise.all([
      this.safeListTable('profiles'), this.safeListTable('player_progression'), this.safeListTable('user_statistics'),
    ]);
    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;
    const monthAgo = now - 30 * DAY_MS;
    const levelByUser = new Map(progressions.map((row) => [String(row.userId), Number(row.currentLevel) || 1]));
    const activeByUser = new Map<string, number>();
    const noteActivity = (userId: string, value: unknown) => {
      const time = Date.parse(String(value || ''));
      if (Number.isFinite(time)) activeByUser.set(userId, Math.max(activeByUser.get(userId) || 0, time));
    };
    for (const row of progressions) noteActivity(String(row.userId), row.updatedAt);
    for (const row of statistics) noteActivity(String(row.userId), row.updatedAt);

    const counts: Record<CrmSegment, number> = { 'All players': 0, 'Inactive 30 days': 0, 'Level 10+': 0, 'New this week': 0, 'Guests': 0 };
    for (const row of profiles) {
      const userId = String(row.userId);
      counts['All players'] += 1;
      if (row.accountType === 'guest') counts.Guests += 1;
      const created = Date.parse(String(row.createdAt || ''));
      if (Number.isFinite(created) && created >= weekAgo) counts['New this week'] += 1;
      if ((levelByUser.get(userId) ?? 1) >= 10) counts['Level 10+'] += 1;
      const lastActive = activeByUser.get(userId) ?? (Number.isFinite(created) ? created : now);
      if (lastActive < monthAgo) counts['Inactive 30 days'] += 1;
    }
    return CRM_SEGMENTS.map((segment) => ({ segment, count: counts[segment] }));
  }

  async save(input: CrmCampaignInput, actor: Actor): Promise<CrmCampaign> {
    const existing = input.id ? await this.campaigns.findOne('id', input.id) : null;
    const id = existing ? String(existing.id) : input.id || `cm_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const recipients = await this.countSegment(input.segment);
    const now = new Date().toISOString();
    const sentAt = input.status === 'sent' ? (existing?.sentAt ? String(existing.sentAt) : now) : '';
    const data = { id, segment: input.segment, subject: input.subject, body: input.body, status: input.status, recipients, sentAt, updatedAt: now, ...(existing ? {} : { createdAt: now }) };
    if (existing) await this.campaigns.patch(existing.$id, data); else await this.campaigns.insert(data);
    await this.writeAudit(actor, input.status === 'sent' ? 'crm.send' : 'crm.save', 'crm_message', id, input.subject);
    return { id, segment: input.segment, subject: input.subject, body: input.body, status: input.status, recipients, sentAt };
  }

  async send(id: string, actor: Actor): Promise<CrmCampaign> {
    const existing = await this.campaigns.findOne('id', id);
    if (!existing) throw new Error('Campaign not found.');
    const recipients = await this.countSegment(String(existing.segment));
    const now = new Date().toISOString();
    const data = { status: 'sent', recipients, sentAt: String(existing.sentAt || '') || now, updatedAt: now };
    await this.campaigns.patch(existing.$id, data);
    await this.writeAudit(actor, 'crm.send', 'crm_message', id, String(existing.subject));
    return this.toCampaign({ ...existing, ...data });
  }

  async remove(id: string, actor: Actor): Promise<void> {
    const existing = await this.campaigns.findOne('id', id);
    if (!existing) throw new Error('Campaign not found.');
    await this.campaigns.delete(existing.$id);
    await this.writeAudit(actor, 'crm.delete', 'crm_message', id, 'deleted');
  }

  private async countSegment(segment: string): Promise<number> {
    const counts = await this.segments();
    return counts.find((entry) => entry.segment === segment)?.count ?? 0;
  }

  private toCampaign(row: Row): CrmCampaign {
    return { id: String(row.id), segment: String(row.segment), subject: String(row.subject || ''), body: String(row.body || ''), sentAt: String(row.sentAt || ''), recipients: Number(row.recipients) || 0, status: row.status === 'sent' ? 'sent' : 'draft' };
  }
  private async safeList(repo: RowRepository): Promise<Row[]> {
    try { return await repo.list([Query.limit(500)]); } catch { return []; }
  }
  private async safeListTable(table: string): Promise<Row[]> {
    try { return await new RowRepository(this.database, table).list([Query.limit(MAX_ROWS)]); } catch { return []; }
  }
  private async writeAudit(actor: Actor, action: string, resourceType: string, resourceId: string, reason: string) {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}