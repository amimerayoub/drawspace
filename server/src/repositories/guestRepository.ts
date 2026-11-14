import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';

export class GuestRepository {
  private readonly sessions: RowRepository;
  private readonly migrations: RowRepository;
  constructor(database: AppwriteDatabase) {
    this.sessions = new RowRepository(database, 'guest_sessions');
    this.migrations = new RowRepository(database, 'guest_migration_records');
  }

  async ensure(userId: string, guestUsername: string, avatarId: string): Promise<void> {
    const now = new Date().toISOString();
    const row = await this.sessions.findOne('guestUserId', userId);
    const data = { guestUserId: userId, guestUsername: guestUsername.slice(0, 32), avatarId: avatarId.slice(0, 32), lastActiveAt: now };
    if (row) {
      if (row.migrationStatus === 'migrated') throw new Error('This guest session has already been migrated.');
      await this.sessions.patch(row.$id, data);
      return;
    }
    await this.sessions.insert({ ...data, createdAt: now, migrationStatus: 'active', convertedUserId: '' });
  }

  async migrateSameAccount(userId: string): Promise<boolean> {
    const session = await this.sessions.findOne('guestUserId', userId);
    if (!session || session.migrationStatus === 'migrated') return false;
    const now = new Date().toISOString();
    await this.sessions.patch(session.$id, { migrationStatus: 'migrated', convertedUserId: userId, lastActiveAt: now });
    await this.migrations.insert({
      guestUserId: userId,
      registeredUserId: userId,
      migratedAt: now,
      migrationStatus: 'completed',
      migrationVersion: '1',
      migrationReference: session.$id,
    });
    return true;
  }
}
