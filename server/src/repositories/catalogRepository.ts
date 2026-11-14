import { randomUUID } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';

export const CATALOGS = {
  avatars: { table: 'avatars', id: 'avatarId', search: ['name', 'category'] },
  titles: { table: 'titles', id: 'titleId', search: ['name', 'description', 'rarity'] },
  achievements: { table: 'achievements', id: 'achievementId', search: ['name', 'description', 'category', 'rarity'] },
  challenges: { table: 'challenges', id: 'challengeId', search: ['name', 'description', 'period', 'type'] },
  words: { table: 'custom_words', id: 'id', search: ['word', 'category', 'difficulty'] },
} as const;
export type CatalogKind = keyof typeof CATALOGS;
type Actor = { userId: string; username: string; role: string };

export class CatalogRepository {
  private readonly audit: RowRepository;
  constructor(private readonly db: AppwriteDatabase) { this.audit = new RowRepository(db, 'audit_logs'); }
  async list(kind: CatalogKind, search = '') {
    const config = CATALOGS[kind]; const rows = await new RowRepository(this.db, config.table).list([Query.limit(500)]);
    const needle = search.trim().toLocaleLowerCase();
    return rows.filter((row) => !needle || config.search.some((field) => String(row[field] ?? '').toLocaleLowerCase().includes(needle))).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  }
  async save(kind: CatalogKind, id: string, input: Record<string, unknown>, actor: Actor) {
    const config = CATALOGS[kind]; const rows = new RowRepository(this.db, config.table);
    const existing = await rows.findOne(config.id, id);
    const duplicate = (await rows.list([Query.equal(config.id, id), Query.limit(2)])).find((row) => row.$id !== existing?.$id);
    if (duplicate) throw new Error('Catalog ID already exists.');
    if (kind === 'words') {
      const word = String(input.word).trim().toLocaleLowerCase();
      const sameWord = await rows.findOne('word', word);
      if (sameWord && sameWord.$id !== existing?.$id) throw new Error('This word already exists.');
      input = { ...input, word };
    }
    const row = existing ? await rows.patch(existing.$id, { ...input, [config.id]: id }) : await rows.insert({ ...input, [config.id]: id });
    await this.log(actor, `catalog.${kind}.${existing ? 'update' : 'create'}`, kind, id, `${id} saved`);
    return row;
  }
  async delete(kind: CatalogKind, id: string, actor: Actor) {
    const config = CATALOGS[kind]; const rows = new RowRepository(this.db, config.table); const row = await rows.findOne(config.id, id);
    if (!row) throw new Error('Catalog item not found.');
    const references: Partial<Record<CatalogKind, [string, string][]>> = {
      avatars: [['profiles', 'avatarId'], ['guest_sessions', 'avatarId'], ['leaderboard_snapshots', 'avatarId']],
      titles: [['user_titles', 'titleId'], ['player_progression', 'equippedTitleId']],
      achievements: [['user_achievements', 'achievementId']],
      challenges: [['user_challenges', 'challengeId']],
    };
    for (const [table, field] of references[kind] || []) {
      if (await new RowRepository(this.db, table).findOne(field, id)) throw new Error('This item is referenced by player data; deactivate it instead of deleting.');
    }
    await rows.delete(row.$id); await this.log(actor, `catalog.${kind}.delete`, kind, id, `${id} deleted`); return { deleted: true };
  }
  private async log(actor: Actor, action: string, type: string, id: string, reason: string) {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32), actorRole: actor.role, action, ipAddress: '', resourceType: type, resourceId: id.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}
