import { randomUUID } from 'node:crypto';
import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';
import { Query } from '../database/appwrite';

export interface ModerationReportInput {
  reporterUserId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  reportType: 'drawing' | 'chat' | 'harassment' | 'cheating' | 'other';
  description: string;
  roomId: string;
}

export class ModerationReportRepository {
  private readonly rows: RowRepository;
  private readonly auditRows: RowRepository;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'moderation_reports'); this.auditRows = new RowRepository(database, 'audit_logs'); }

  async create(input: ModerationReportInput): Promise<{ id: string; status: string; createdAt: string }> {
    const now = new Date().toISOString();
    const id = `report_${this.rowsId()}`;
    await this.rows.insert({
      id,
      reporterUserId: input.reporterUserId,
      reporterUsername: input.reporterUsername,
      reportedUserId: input.reportedUserId,
      reportedUsername: input.reportedUsername,
      reportType: input.reportType,
      description: input.description,
      roomId: input.roomId,
      evidenceReference: '',
      status: 'pending',
      assignedModeratorId: '',
      moderatorNotes: '',
      resolutionAction: '',
      createdAt: now,
      updatedAt: now,
    });
    return { id, status: 'pending', createdAt: now };
  }

  async list(status?: string) {
    const rows = await this.rows.list(status ? [Query.equal('status', status), Query.orderDesc('createdAt'), Query.limit(200)] : [Query.orderDesc('createdAt'), Query.limit(200)]);
    return rows.map((row) => ({ id: String(row.id), type: String(row.reportType), target: row.roomId ? `Room ${String(row.roomId)}` : String(row.reportedUserId), reporter: String(row.reporterUsername), reason: String(row.reportType), at: String(row.createdAt), status: row.status === 'pending' ? 'open' : String(row.status), detail: String(row.description), reportedUserId: String(row.reportedUserId || ''), reportedUsername: String(row.reportedUsername || ''), roomId: String(row.roomId || '') }));
  }

  async resolve(id: string, status: 'resolved' | 'dismissed', actor: { userId: string; username: string; role: string }, reason: string) {
    const report = await this.rows.findOne('id', id);
    if (!report) throw new Error('Report not found.');
    if (report.status !== 'pending' && report.status !== 'open') throw new Error('This report has already been reviewed.');
    const now = new Date().toISOString();
    await this.rows.patch(report.$id, { status, assignedModeratorId: actor.userId, moderatorNotes: reason, resolutionAction: status, updatedAt: now });
    await this.auditRows.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Moderator', actorRole: actor.role, action: `report.${status}`, ipAddress: '', resourceType: 'moderation_report', resourceId: id, status: 'success', reason, createdAt: now });
    return { id, status };
  }

  private rowsId(): string { return randomUUID(); }
}
