import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export interface ProfileRecord {
  userId: string;
  username: string;
  normalizedUsername: string;
  displayName: string;
  bio: string;
  avatarId: string;
  accountType: 'registered' | 'guest';
  createdAt: string;
  updatedAt: string;
}

export class ProfileRepository {
  private readonly rows: RowRepository;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'profiles'); }

  async get(userId: string): Promise<ProfileRecord | null> {
    const row = await this.rows.findOne('userId', userId);
    return row ? this.toProfile(row) : null;
  }

  async findUsername(username: string): Promise<ProfileRecord | null> {
    const row = await this.rows.findOne('normalizedUsername', username.trim().toLowerCase());
    return row ? this.toProfile(row) : null;
  }

  async ensure(input: Pick<ProfileRecord, 'userId' | 'username' | 'avatarId' | 'accountType'>): Promise<ProfileRecord> {
    const existing = await this.get(input.userId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const row = await this.rows.insert({
      userId: input.userId,
      username: input.username.trim(),
      normalizedUsername: input.username.trim().toLowerCase(),
      displayName: input.username.trim(),
      bio: '',
      avatarId: input.avatarId,
      accountType: input.accountType,
      createdAt: now,
      updatedAt: now,
    });
    return this.toProfile(row);
  }

  async update(userId: string, patch: Partial<Pick<ProfileRecord, 'username' | 'displayName' | 'bio' | 'avatarId'>>): Promise<ProfileRecord> {
    const existing = await this.rows.findOne('userId', userId);
    if (!existing) throw new Error('Profile not found');
    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.username !== undefined) {
      data.username = patch.username.trim();
      data.normalizedUsername = patch.username.trim().toLowerCase();
    }
    if (patch.displayName !== undefined) data.displayName = patch.displayName.trim();
    if (patch.bio !== undefined) data.bio = patch.bio.trim();
    if (patch.avatarId !== undefined) data.avatarId = patch.avatarId;
    return this.toProfile(await this.rows.patch(existing.$id, data));
  }

  async markRegistered(userId: string): Promise<void> {
    const existing = await this.rows.findOne('userId', userId);
    if (existing) await this.rows.patch(existing.$id, { accountType: 'registered', updatedAt: new Date().toISOString() });
  }

  private toProfile(row: Row): ProfileRecord {
    return {
      userId: String(row.userId),
      username: String(row.username),
      normalizedUsername: String(row.normalizedUsername),
      displayName: String(row.displayName ?? row.username),
      bio: String(row.bio ?? ''),
      avatarId: String(row.avatarId ?? 'av-01'),
      accountType: row.accountType === 'guest' ? 'guest' : 'registered',
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }
}
