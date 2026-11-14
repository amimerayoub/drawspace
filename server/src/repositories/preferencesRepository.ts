import type { AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export interface PreferencesRecord {
  theme: 'dark' | 'light';
  language: string;
  soundEnabled: boolean;
  notificationPreferences: Record<string, boolean>;
  privacySettings: Record<string, boolean>;
}

const defaults: PreferencesRecord = { theme: 'dark', language: 'en-US', soundEnabled: true, notificationPreferences: {}, privacySettings: {} };

export class PreferencesRepository {
  private readonly rows: RowRepository;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'user_preferences'); }

  async get(userId: string): Promise<PreferencesRecord> {
    const row = await this.rows.findOne('userId', userId);
    return row ? this.fromRow(row) : defaults;
  }

  async update(userId: string, patch: Partial<PreferencesRecord>): Promise<PreferencesRecord> {
    const old = await this.rows.findOne('userId', userId);
    const current = old ? this.fromRow(old) : defaults;
    const next = { ...current, ...patch };
    const rowData = {
      userId,
      theme: next.theme,
      language: next.language,
      soundEnabled: next.soundEnabled,
      notificationPreferences: JSON.stringify(next.notificationPreferences),
      privacySettings: JSON.stringify(next.privacySettings),
      updatedAt: new Date().toISOString(),
    };
    if (old) await this.rows.patch(old.$id, rowData);
    else await this.rows.insert(rowData);
    return next;
  }

  private fromRow(row: Row): PreferencesRecord {
    return {
      theme: row.theme === 'light' ? 'light' : 'dark',
      language: String(row.language ?? 'en-US'),
      soundEnabled: row.soundEnabled !== false,
      notificationPreferences: this.parseMap(row.notificationPreferences),
      privacySettings: this.parseMap(row.privacySettings),
    };
  }

  private parseMap(value: unknown): Record<string, boolean> {
    if (typeof value !== 'string') return {};
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch { return {}; }
  }
}
