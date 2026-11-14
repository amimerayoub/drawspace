import { createHash } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from './rowRepository';
import { StatisticsRepository } from './statisticsRepository';

type Table = 'player_progression' | 'xp_transactions' | 'achievements' | 'user_achievements' | 'titles' | 'user_titles' | 'challenges' | 'user_challenges' | 'leaderboard_snapshots';
const LEVEL_BASE = 100;
const LEVEL_GROWTH = 1.18;

export function levelForXp(totalXP: number) {
  let level = 1;
  let remaining = Math.max(0, totalXP);
  let needed = LEVEL_BASE;
  while (remaining >= needed && level < 99) { remaining -= needed; level += 1; needed = Math.round(LEVEL_BASE * LEVEL_GROWTH ** (level - 1)); }
  return { level, into: remaining, needed };
}

export class ProgressionRepository {
  private readonly tables = new Map<Table, RowRepository>();
  private readonly statistics: StatisticsRepository;
  constructor(private readonly database: AppwriteDatabase) {
    for (const table of ['player_progression', 'xp_transactions', 'achievements', 'user_achievements', 'titles', 'user_titles', 'challenges', 'user_challenges', 'leaderboard_snapshots'] as const) {
      this.tables.set(table, new RowRepository(database, table));
    }
    this.statistics = new StatisticsRepository(database);
  }

  async dashboard(userId: string) {
    const [progression, stats, achievements, unlockedAchievements, titles, unlockedTitles, challenges, userChallenges, transactions] = await Promise.all([
      this.one('player_progression', 'userId', userId), this.statistics.get(userId), this.list('achievements', [Query.equal('isActive', true), Query.limit(200)]),
      this.list('user_achievements', [Query.equal('userId', userId), Query.limit(200)]), this.list('titles', [Query.equal('isActive', true), Query.limit(200)]),
      this.list('user_titles', [Query.equal('userId', userId), Query.limit(200)]), this.list('challenges', [Query.equal('isActive', true), Query.limit(200)]),
      this.list('user_challenges', [Query.equal('userId', userId), Query.limit(200)]), this.list('xp_transactions', [Query.equal('userId', userId), Query.orderDesc('createdAt'), Query.limit(100)]),
    ]);
    const totalXP = Number(progression?.totalXP) || 0;
    const level = levelForXp(totalXP);
    const unlockedAchievementIds = new Set(unlockedAchievements.map((row) => String(row.achievementId)));
    const unlockedTitleIds = new Set(unlockedTitles.map((row) => String(row.titleId)));
    const achievementRows = achievements.map((row) => {
      const condition = String(row.conditionType || '').toLowerCase();
      const current = condition.includes('win') ? stats.gamesWon : condition.includes('guess') ? stats.correctGuesses : condition.includes('game') || condition.includes('match') ? stats.totalGames : condition.includes('point') || condition.includes('score') ? stats.totalPoints : 0;
      return { id: String(row.achievementId), name: String(row.name), description: String(row.description || ''), icon: String(row.iconAsset || ''), xpReward: Number(row.rewardXP) || 0, condition, active: true, goal: Number(row.conditionValue) || 1, progress: Math.min(current, Number(row.conditionValue) || 1), unlockedAt: unlockedAchievements.find((item) => item.achievementId === row.achievementId)?.unlockedAt as string | undefined };
    });
    return {
      progression: { totalXP, highestLevel: Number(progression?.highestLevel) || level.level, equippedTitleId: String(progression?.equippedTitleId || '') || null, ...level, level: Number(progression?.currentLevel) || level.level },
      statistics: stats,
      achievements: achievementRows,
      titles: titles.map((row) => ({ id: String(row.titleId), name: String(row.name), description: String(row.description || ''), image: String(row.iconAsset || ''), xpReward: 0, condition: String(row.unlockCondition || ''), active: true, unlocked: unlockedTitleIds.has(String(row.titleId)) })),
      challenges: challenges.map((row) => {
        const periodKey = this.periodKey(String(row.period), new Date());
        const state = userChallenges.find((item) => item.challengeId === row.challengeId && item.periodKey === periodKey);
        return { id: String(row.challengeId), name: String(row.name), description: String(row.description || ''), period: String(row.period), objective: Number(row.targetValue) || 1, progress: Number(state?.progress) || 0, xpReward: Number(row.rewardXP) || 0, startsAt: String(row.startsAt || ''), endsAt: String(row.endsAt || ''), claimed: Boolean(state?.claimed), active: true };
      }),
      rewards: transactions.map((row) => ({ id: String(row.transactionId), userId, label: String(row.reason || ''), xp: Number(row.amount) || 0, at: String(row.createdAt), kind: this.rewardKind(String(row.rewardType)) })),
    };
  }

  async leaderboard(period = 'all-time') {
    const [progressions, profiles, statistics, titles] = await Promise.all([
      this.list('player_progression', [Query.limit(500)]),
      new RowRepository(this.database, 'profiles').list([Query.limit(500)]),
      new RowRepository(this.database, 'user_statistics').list([Query.limit(500)]),
      this.list('titles', [Query.equal('isActive', true), Query.limit(200)]),
    ]);
    const profileById = new Map(profiles.map((row) => [String(row.userId), row]));
    const statsById = new Map(statistics.map((row) => [String(row.userId), row]));
    const titlesById = new Map(titles.map((row) => [String(row.titleId), row]));
    return progressions.map((row) => {
      const userId = String(row.userId);
      const profile = profileById.get(userId);
      const titleId = String(row.equippedTitleId || '') || null;
      const title = titleId ? titlesById.get(titleId) : undefined;
      return { rank: 0, userId, username: String(profile?.username || profile?.displayName || 'Player'), avatarId: String(profile?.avatarId || 'av-01'), level: Number(row.currentLevel) || 1, xp: Number(row.totalXP) || 0, wins: Number(statsById.get(userId)?.gamesWon) || 0, titleId, titleName: title ? String(title.name) : null, titleDescription: title ? String(title.description || '') : null, titleImage: title ? String(title.iconAsset || '') : null };
    }).sort((a, b) => b.xp - a.xp || b.wins - a.wins).slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  async publicAchievements() {
    const rows = await this.list('achievements', [Query.equal('isActive', true), Query.limit(200)]);
    return rows.map((row) => ({ id: String(row.achievementId), name: String(row.name), description: String(row.description || ''), icon: String(row.iconAsset || ''), xpReward: Number(row.rewardXP) || 0, condition: String(row.conditionType || ''), active: true, goal: Number(row.conditionValue) || 1 }));
  }

  async equipTitle(userId: string, titleId: string | null) {
    if (titleId) {
      const title = await this.one('titles', 'titleId', titleId);
      const owned = await this.find('user_titles', [Query.equal('userId', userId), Query.equal('titleId', titleId), Query.limit(1)]);
      if (!title || title.isActive !== true || !owned) throw new Error('That title is not unlocked for this account.');
    }
    const existing = await this.one('player_progression', 'userId', userId);
    if (existing) await this.repo('player_progression').patch(existing.$id, { equippedTitleId: titleId || '', updatedAt: new Date().toISOString() });
    else await this.repo('player_progression').insert({ userId, currentLevel: 1, highestLevel: 1, totalXP: 0, equippedTitleId: titleId || '', updatedAt: new Date().toISOString() });
    return { equippedTitleId: titleId };
  }

  async claimChallenge(userId: string, challengeId: string) {
    const challenge = await this.one('challenges', 'challengeId', challengeId);
    if (!challenge || challenge.isActive !== true) throw new Error('Challenge is unavailable.');
    const periodKey = this.periodKey(String(challenge.period), new Date());
    const state = await this.find('user_challenges', [Query.equal('userId', userId), Query.equal('challengeId', challengeId), Query.equal('periodKey', periodKey), Query.limit(1)]);
    if (!state || Number(state.progress) < Number(challenge.targetValue) || state.claimed === true) throw new Error('Challenge is not ready to claim.');
    const xp = Number(challenge.rewardXP) || 0;
    const result = await this.award(userId, xp, `challenge:${challengeId}:${periodKey}:${userId}`, 'challenge', `Challenge: ${String(challenge.name)}`, '');
    if (!result.awarded) throw new Error('Challenge reward has already been claimed.');
    await this.repo('user_challenges').patch(state.$id, { claimed: true });
    return { xp };
  }

  async recordMatch(matchId: string, player: { userId: string; score: number; wins: number; correctGuesses: number; totalGuesses: number; place: number }) {
    const xp = Math.max(0, player.correctGuesses * 15 + (player.place === 1 ? 30 : 0));
    const award = await this.award(player.userId, xp, `match:${matchId}:${player.userId}`, 'match', `Match finished, place ${player.place}`, matchId);
    if (!award.awarded) return { duplicate: true, xp: 0 };
    const stats = await this.statistics.recordMatch(player.userId, { totalGames: 1, gamesWon: player.wins, totalGuesses: player.totalGuesses, correctGuesses: player.correctGuesses, totalPoints: player.score });
    await this.unlockEligible(player.userId, stats, award.totalXP);
    await this.updateChallenges(player.userId, { games: 1, wins: player.wins, guesses: player.correctGuesses, points: player.score });
    return { duplicate: false, xp, totalXP: award.totalXP };
  }

  private async unlockEligible(userId: string, stats: Awaited<ReturnType<StatisticsRepository['get']>>, totalXP: number) {
    const rows = await this.list('achievements', [Query.equal('isActive', true), Query.limit(200)]);
    for (const row of rows) {
      const condition = String(row.conditionType || '').toLowerCase();
      const value = condition.includes('win') ? stats.gamesWon : condition.includes('guess') ? stats.correctGuesses : condition.includes('game') || condition.includes('match') ? stats.totalGames : condition.includes('point') || condition.includes('score') ? stats.totalPoints : 0;
      const goal = Number(row.conditionValue) || Infinity;
      if (value < goal) continue;
      const achievementId = String(row.achievementId);
      const current = await this.find('user_achievements', [Query.equal('userId', userId), Query.equal('achievementId', achievementId), Query.limit(1)]);
      if (current) continue;
      const transactionId = this.transactionId(`achievement:${achievementId}:${userId}`);
      const rewardXP = Number(row.rewardXP) || 0;
      const reward = await this.award(userId, rewardXP, transactionId, 'achievement', `Achievement: ${String(row.name)}`, '');
      if (!reward.awarded) continue;
      await this.repo('user_achievements').insert({ userId, achievementId, unlockedAt: new Date().toISOString(), progressSnapshot: value, rewardTransactionId: transactionId });
      const progression = await this.one('player_progression', 'userId', userId);
      if (progression) await this.repo('player_progression').patch(progression.$id, { totalXP: reward.totalXP, currentLevel: levelForXp(reward.totalXP).level, highestLevel: Math.max(Number(progression.highestLevel) || 1, levelForXp(reward.totalXP).level), updatedAt: new Date().toISOString() });
      totalXP = reward.totalXP;
    }
    await this.unlockTitles(userId, stats);
    void totalXP;
  }

  private async unlockTitles(userId: string, stats: Awaited<ReturnType<StatisticsRepository['get']>>) {
    const titles = await this.list('titles', [Query.equal('isActive', true), Query.limit(200)]);
    for (const title of titles) {
      const condition = String(title.unlockCondition || '').toLowerCase();
      const target = Number(condition.match(/\d+/)?.[0] || 1);
      const eligible = condition.includes('create an account') || condition.includes('joined drawspace')
        || ((condition.includes('guess') || condition.includes('correct')) && stats.correctGuesses >= target)
        || ((condition.includes('win') || condition.includes('match')) && stats.gamesWon >= target);
      if (!eligible) continue;
      const titleId = String(title.titleId);
      const already = await this.find('user_titles', [Query.equal('userId', userId), Query.equal('titleId', titleId), Query.limit(1)]);
      if (!already) await this.repo('user_titles').insert({ userId, titleId, unlockedAt: new Date().toISOString() });
    }
  }

  private async updateChallenges(userId: string, delta: { games: number; wins: number; guesses: number; points: number }) {
    const now = new Date();
    const challenges = await this.list('challenges', [Query.equal('isActive', true), Query.limit(200)]);
    for (const challenge of challenges) {
      const startsAt = Date.parse(String(challenge.startsAt || ''));
      const endsAt = Date.parse(String(challenge.endsAt || ''));
      if ((Number.isFinite(startsAt) && startsAt > now.getTime()) || (Number.isFinite(endsAt) && endsAt < now.getTime())) continue;
      const periodKey = this.periodKey(String(challenge.period), now);
      const existing = await this.find('user_challenges', [Query.equal('userId', userId), Query.equal('challengeId', String(challenge.challengeId)), Query.equal('periodKey', periodKey), Query.limit(1)]);
      if (existing?.claimed === true) continue;
      const type = String(challenge.type || '').toLowerCase();
      const increment = type.includes('win') ? delta.wins : type.includes('guess') ? delta.guesses : type.includes('point') || type.includes('score') ? delta.points : delta.games;
      const progress = Math.min(Number(challenge.targetValue) || Number.MAX_SAFE_INTEGER, (Number(existing?.progress) || 0) + increment);
      if (existing) await this.repo('user_challenges').patch(existing.$id, { progress });
      else await this.repo('user_challenges').insert({ userId, challengeId: String(challenge.challengeId), periodKey, progress, completed: progress >= Number(challenge.targetValue), claimed: false });
    }
  }

  private async award(userId: string, amount: number, transactionIdValue: string, rewardType: string, reason: string, matchId: string) {
    const transactionId = this.transactionId(transactionIdValue);
    const prior = await this.find('xp_transactions', [Query.equal('transactionId', transactionId), Query.limit(1)]);
    if (prior) return { awarded: false, totalXP: Number((await this.one('player_progression', 'userId', userId))?.totalXP) || 0 };
    const createdAt = new Date().toISOString();
    try { await this.repo('xp_transactions').insert({ transactionId, amount, userId, rewardType, createdAt, reason, matchId }); }
    catch (error) {
      const raced = await this.find('xp_transactions', [Query.equal('transactionId', transactionId), Query.limit(1)]);
      if (raced) return { awarded: false, totalXP: Number((await this.one('player_progression', 'userId', userId))?.totalXP) || 0 };
      throw error;
    }
    const current = await this.one('player_progression', 'userId', userId);
    const totalXP = (Number(current?.totalXP) || 0) + amount;
    const level = levelForXp(totalXP).level;
    if (current) await this.repo('player_progression').patch(current.$id, { totalXP, currentLevel: level, highestLevel: Math.max(Number(current.highestLevel) || 1, level), updatedAt: createdAt });
    else await this.repo('player_progression').insert({ userId, totalXP, currentLevel: level, highestLevel: level, equippedTitleId: '', updatedAt: createdAt });
    return { awarded: true, totalXP };
  }

  private periodKey(period: string, now: Date) {
    if (period === 'daily') return now.toISOString().slice(0, 10);
    if (period === 'weekly') { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
    return period === 'special' ? now.toISOString().slice(0, 7) : 'all-time';
  }
  private transactionId(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private rewardKind(value: string): 'guess' | 'draw' | 'match' | 'challenge' | 'achievement' { return ['guess', 'draw', 'match', 'challenge', 'achievement'].includes(value) ? value as ReturnType<ProgressionRepository['rewardKind']> : 'match'; }
  private repo(table: Table) { return this.tables.get(table)!; }
  private async one(table: Table, field: string, value: string) { return this.find(table, [Query.equal(field, value), Query.limit(1)]); }
  private async find(table: Table, queries: string[]): Promise<Row | null> { return (await this.list(table, queries))[0] ?? null; }
  private async list(table: Table, queries: string[]) { return this.repo(table).list(queries); }
}
