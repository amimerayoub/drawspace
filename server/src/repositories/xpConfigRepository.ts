import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';

export interface XpSettings {
  correctGuessXp: number;
  winBonusXp: number;
  challengeMultiplier: number;
  levelBase: number;
  levelGrowth: number;
}
export interface XpConfigActor { userId: string; username: string; role: string }

export const XP_DEFAULTS: XpSettings = { correctGuessXp: 15, winBonusXp: 30, challengeMultiplier: 1, levelBase: 100, levelGrowth: 1.18 };

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

export class XpConfigRepository {
  private readonly rows: RowRepository;
  private readonly audit: RowRepository;
  private cache: { value: XpSettings; at: number } | null = null;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'xp_config'); this.audit = new RowRepository(database, 'audit_logs'); }

  async get(): Promise<XpSettings> {
    if (this.cache && Date.now() - this.cache.at < 5_000) return this.cache.value;
    let value = { ...XP_DEFAULTS };
    try {
      const row = (await this.rows.list([Query.limit(1)]))[0];
      if (row) value = {
        correctGuessXp: clamp(row.correctGuessXp, XP_DEFAULTS.correctGuessXp, 0, 200),
        winBonusXp: clamp(row.winBonusXp, XP_DEFAULTS.winBonusXp, 0, 500),
        challengeMultiplier: clamp(row.challengeMultiplier, XP_DEFAULTS.challengeMultiplier, 0.5, 5),
        levelBase: clamp(row.levelBase, XP_DEFAULTS.levelBase, 10, 5000),
        levelGrowth: clamp(row.levelGrowth, XP_DEFAULTS.levelGrowth, 1, 2),
      };
    } catch { /* The xp_config table may not exist yet; defaults preserve current behavior. */ }
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(next: XpSettings, actor: XpConfigActor): Promise<XpSettings> {
    const before = await this.get();
    const row = (await this.rows.list([Query.limit(1)]))[0];
    const data = { ...next, updatedAt: new Date().toISOString(), updatedBy: actor.userId };
    if (row) await this.rows.patch(row.$id, data);
    else await this.rows.insert(data);
    this.cache = { value: { ...next }, at: Date.now() };
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32), actorRole: actor.role, action: 'config.xp', ipAddress: '', resourceType: 'xp_config', resourceId: 'singleton', status: 'success', reason: `${JSON.stringify(before)} => ${JSON.stringify(next)}`.slice(0, 255), createdAt: new Date().toISOString() });
    return next;
  }
}