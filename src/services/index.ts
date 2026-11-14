import { db, commit, uid } from './db';
import { backendAuthService } from './backendAuth.service';
import { BOT_PLAYERS, TOTAL_REGISTERED } from '@/data/mock';
import type {
  Achievement, AdUnit, Article, Challenge, CrmMessage, Locale, RedirectRule, Report, RewardEntry,
  Room, RoomPlayer, RoomSettings, SeoRecord, Title, User, Word,
} from '@/types';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function cacheSessionUser(user: User | null) {
  if (!user) return null;
  const existing = db.users.find((item) => item.id === user.id);
  if (existing) Object.assign(existing, user);
  else db.users.push(user);
  commit();
  return user;
}

function audit(admin: string, action: string, target: string, before: string, after: string, status: 'success' | 'failed' = 'success') {
  db.audit.unshift({ id: uid('au'), admin, action, target, at: new Date().toISOString(), before, after, status });
}

/* ---------- Auth ---------- */

export const authService = {
  async signIn(identifier: string, password: string): Promise<User> {
    const user = await backendAuthService.signIn(identifier, password);
    const local = db.users.find((item) => item.id === user.id);
    if (local) Object.assign(local, user);
    else db.users.push(user);
    commit();
    return user;
  },

  async signUp(username: string, email: string, password: string): Promise<User> {
    const user = await backendAuthService.signUp(username, email, password);
    db.users.push(user);
    audit(user.username, 'user.register', user.username, '', 'player');
    commit();
    return user;
  },

  async continueAsGuest(username: string, avatarId: string): Promise<User> {
    const user = await backendAuthService.continueAsGuest(username, avatarId);
    const existing = db.users.find((item) => item.id === user.id);
    if (existing) Object.assign(existing, user);
    else db.users.push(user);
    commit();
    return user;
  },

  async getCurrentSessionUser() { return cacheSessionUser(await backendAuthService.getCurrentSessionUser()); },

  async signOut() { await backendAuthService.signOut(); },

  async updateProfile(id: string, patch: Partial<User>) {
    const updated = await backendAuthService.updateProfile(id, {
      username: patch.username,
      bio: patch.bio,
      avatarId: patch.avatarId,
    });
    const local = db.users.find((item) => item.id === id);
    if (local) Object.assign(local, { username: updated.username, bio: updated.bio, avatarId: updated.avatarId });
    commit();
    return local;
  },

  localUser(id: string) { return db.users.find((item) => item.id === id); },

  updateUser(id: string, patch: Partial<User>) {
    const user = db.users.find((u) => u.id === id);
    if (!user) return;
    Object.assign(user, patch);
    commit();
  },

  playerThreshold(): string | null {
    const n = TOTAL_REGISTERED;
    if (n >= 10000) return '10K+';
    if (n >= 1000) return '1K+';
    if (n >= 100) return '100+';
    if (n >= 20) return '20+';
    return null;
  },
};

/* ---------- Rooms ---------- */

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export const roomService = {
  listPublic(): Room[] {
    return db.rooms.filter((r) => r.visibility === 'public');
  },

  get(code: string): Room | undefined {
    return db.rooms.find((r) => r.code === code.toUpperCase());
  },

  create(settings: RoomSettings, host: { id: string; username: string; avatarId: string }): Room {
    const room: Room = {
      code: makeCode(),
      name: settings.name.trim() || `${host.username}'s room`,
      visibility: settings.visibility,
      hasPassword: Boolean(settings.password),
      password: settings.password || undefined,
      hostId: host.id,
      players: [{ id: host.id, username: host.username, avatarId: host.avatarId, score: 0, isHost: true, isBot: false, guessed: false }],
      settings: { ...settings, name: settings.name.trim() || `${host.username}'s room` },
      status: 'waiting',
      createdAt: new Date().toISOString(),
    };
    db.rooms.unshift(room);
    commit();
    return room;
  },

  join(code: string, password: string, player: { id: string; username: string; avatarId: string }): Room {
    const room = this.get(code);
    if (!room) throw new Error('No room found with that code.');
    if (room.status === 'finished') throw new Error('That match has already finished.');
    if (room.hasPassword && room.password !== password) throw new Error('Incorrect room password.');
    if (room.players.length >= room.settings.maxPlayers) throw new Error('That room is full.');
    if (!room.players.some((p) => p.id === player.id)) {
      room.players.push({ id: player.id, username: player.username, avatarId: player.avatarId, score: 0, isHost: false, isBot: false, guessed: false });
      commit();
    }
    return room;
  },

  addBot(code: string): RoomPlayer | null {
    const room = this.get(code);
    if (!room || room.players.length >= room.settings.maxPlayers) return null;
    const used = new Set(room.players.map((p) => p.id));
    const bot = BOT_PLAYERS.find((b) => !used.has(b.id));
    if (!bot) return null;
    const player: RoomPlayer = { ...bot, score: 0, isHost: false, isBot: true, guessed: false };
    room.players.push(player);
    commit();
    return player;
  },

  removePlayer(code: string, playerId: string) {
    const room = this.get(code);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== playerId);
    commit();
  },

  start(code: string) {
    const room = this.get(code);
    if (room) {
      room.status = 'playing';
      commit();
    }
  },

  finish(code: string) {
    const room = this.get(code);
    if (room) {
      room.status = 'finished';
      commit();
    }
  },

  close(code: string, admin: string) {
    const room = this.get(code);
    if (!room) return;
    db.rooms = db.rooms.filter((r) => r.code !== code);
    audit(admin, 'room.close', code, room.status, 'closed');
    commit();
  },

  update(code: string, patch: Partial<Room>, admin: string) {
    const room = this.get(code);
    if (!room) return;
    const before = JSON.stringify({ name: room.name, visibility: room.visibility });
    Object.assign(room, patch);
    audit(admin, 'room.update', code, before, JSON.stringify({ name: room.name, visibility: room.visibility }));
    commit();
  },
};

/* ---------- Words ---------- */

export const wordService = {
  active(difficulty?: Word['difficulty']): Word[] {
    return db.words.filter((w) => w.active && (!difficulty || w.difficulty === difficulty));
  },

  pickChoices(count: number, difficulty: Word['difficulty'] | 'mixed', exclude: string[] = []): Word[] {
    const pool = db.words.filter((w) => w.active && !exclude.includes(w.id) && (difficulty === 'mixed' || w.difficulty === difficulty));
    const source = pool.length >= count ? pool : db.words.filter((w) => w.active && !exclude.includes(w.id));
    const shuffled = [...source].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  },

  save(word: Word, admin: string) {
    const existing = db.words.find((w) => w.id === word.id);
    if (existing) {
      audit(admin, 'word.update', word.text, existing.difficulty, word.difficulty);
      Object.assign(existing, word);
    } else {
      db.words.unshift(word);
      audit(admin, 'word.create', word.text, '', word.difficulty);
    }
    commit();
  },

  remove(id: string, admin: string) {
    const word = db.words.find((w) => w.id === id);
    db.words = db.words.filter((w) => w.id !== id);
    if (word) audit(admin, 'word.delete', word.text, word.difficulty, '');
    commit();
  },

  toggle(id: string, admin: string) {
    const word = db.words.find((w) => w.id === id);
    if (!word) return;
    word.active = !word.active;
    audit(admin, 'word.toggle', word.text, String(!word.active), String(word.active));
    commit();
  },
};

/* ---------- Progression ---------- */

export function levelForXp(xp: number): { level: number; into: number; needed: number } {
  const { levelBase, levelGrowth } = db.xpConfig;
  let level = 1;
  let needed = levelBase;
  let remaining = xp;
  while (remaining >= needed && level < 99) {
    remaining -= needed;
    level += 1;
    needed = Math.round(levelBase * Math.pow(levelGrowth, level - 1));
  }
  return { level, into: remaining, needed };
}

export const progressionService = {
  achievements(): Achievement[] {
    return db.achievements.filter((a) => a.active);
  },
  titles(): Title[] {
    return db.titles.filter((t) => t.active);
  },
  challenges(): Challenge[] {
    return db.challenges.filter((c) => c.active);
  },
  rewards(userId?: string): RewardEntry[] {
    return userId ? db.rewards.filter((r) => r.userId === userId) : db.rewards;
  },
  leaderboard() {
    return db.leaderboard;
  },

  claimChallenge(id: string, userId: string): number {
    const challenge = db.challenges.find((c) => c.id === id);
    if (!challenge || challenge.claimed || challenge.progress < challenge.objective) return 0;
    challenge.claimed = true;
    const xp = Math.round(challenge.xpReward * db.xpConfig.challengeMultiplier);
    db.rewards.unshift({ id: uid('r'), userId, label: `Challenge: ${challenge.name}`, xp, at: new Date().toISOString(), kind: 'challenge' });
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      user.xp += xp;
      user.level = levelForXp(user.xp).level;
    }
    commit();
    return xp;
  },

  grantXp(userId: string, amount: number, label: string, kind: RewardEntry['kind']) {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    user.xp += amount;
    user.level = levelForXp(user.xp).level;
    db.rewards.unshift({ id: uid('r'), userId, label, xp: amount, at: new Date().toISOString(), kind });
    commit();
  },

  equipTitle(userId: string, titleId: string | null) {
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      user.titleId = titleId;
      commit();
    }
  },
};

/* ---------- Blog ---------- */

export const blogService = {
  published(): Article[] {
    return db.articles
      .filter((a) => a.status === 'published' || (a.status === 'scheduled' && new Date(a.publishAt) <= new Date()))
      .sort((a, b) => b.publishAt.localeCompare(a.publishAt));
  },
  bySlug(slug: string): Article | undefined {
    return db.articles.find((a) => a.slug === slug);
  },
  all(): Article[] {
    return db.articles;
  },
  save(article: Article, admin: string) {
    const existing = db.articles.find((a) => a.id === article.id);
    if (existing) {
      audit(admin, 'article.update', article.slug, existing.status, article.status);
      Object.assign(existing, article);
    } else {
      db.articles.unshift(article);
      audit(admin, 'article.create', article.slug, '', article.status);
    }
    commit();
  },
  remove(id: string, admin: string) {
    const article = db.articles.find((a) => a.id === id);
    db.articles = db.articles.filter((a) => a.id !== id);
    if (article) audit(admin, 'article.delete', article.slug, article.status, '');
    commit();
  },
};

/* ---------- Reports ---------- */

export const reportService = {
  create(report: Omit<Report, 'id' | 'at' | 'status'>) {
    db.reports.unshift({ ...report, id: uid('rp'), at: new Date().toISOString(), status: 'open' });
    commit();
  },
};

/* ---------- Admin: generic collection helpers ---------- */

export const adminService = {
  audit,

  users(): User[] {
    return db.users;
  },

  saveUser(user: User, admin: string) {
    const existing = db.users.find((u) => u.id === user.id);
    if (existing) {
      audit(admin, 'user.update', user.username, `${existing.role}/${existing.status}`, `${user.role}/${user.status}`);
      Object.assign(existing, user);
    } else {
      db.users.push(user);
      audit(admin, 'user.create', user.username, '', user.role);
    }
    commit();
  },

  setUserStatus(id: string, status: User['status'], admin: string) {
    const user = db.users.find((u) => u.id === id);
    if (!user) return;
    audit(admin, `user.${status}`, user.username, user.status, status);
    user.status = status;
    commit();
  },

  removeUser(id: string, admin: string) {
    const user = db.users.find((u) => u.id === id);
    db.users = db.users.filter((u) => u.id !== id);
    if (user) audit(admin, 'user.delete', user.username, user.role, '');
    commit();
  },

  saveAvatar(avatar: AvatarDefLike, admin: string) {
    const existing = db.avatars.find((a) => a.id === avatar.id);
    if (existing) {
      audit(admin, 'avatar.update', avatar.name, String(existing.enabled), String(avatar.enabled));
      Object.assign(existing, avatar);
    } else {
      db.avatars.push({ ...avatar, order: db.avatars.length });
      audit(admin, 'avatar.create', avatar.name, '', 'enabled');
    }
    commit();
  },

  removeAvatar(id: string, admin: string) {
    const avatar = db.avatars.find((a) => a.id === id);
    db.avatars = db.avatars.filter((a) => a.id !== id);
    if (avatar) audit(admin, 'avatar.delete', avatar.name, '', '');
    commit();
  },

  setDefaultAvatar(id: string, admin: string) {
    db.avatars.forEach((a) => { a.isDefault = a.id === id; });
    const avatar = db.avatars.find((a) => a.id === id);
    if (avatar) audit(admin, 'avatar.default', avatar.name, '', 'default');
    commit();
  },

  moveAvatar(id: string, dir: -1 | 1) {
    const sorted = [...db.avatars].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((a) => a.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= sorted.length) return;
    const tmp = sorted[idx].order;
    sorted[idx].order = sorted[swap].order;
    sorted[swap].order = tmp;
    commit();
  },

  saveTitle(title: Title, admin: string) {
    const existing = db.titles.find((t) => t.id === title.id);
    if (existing) {
      audit(admin, 'title.update', title.name, String(existing.xpReward), String(title.xpReward));
      Object.assign(existing, title);
    } else {
      db.titles.push(title);
      audit(admin, 'title.create', title.name, '', `${title.xpReward} XP`);
    }
    commit();
  },

  removeTitle(id: string, admin: string) {
    const title = db.titles.find((t) => t.id === id);
    db.titles = db.titles.filter((t) => t.id !== id);
    if (title) audit(admin, 'title.delete', title.name, '', '');
    commit();
  },

  saveAchievement(achievement: Achievement, admin: string) {
    const existing = db.achievements.find((a) => a.id === achievement.id);
    if (existing) {
      audit(admin, 'achievement.update', achievement.name, String(existing.xpReward), String(achievement.xpReward));
      Object.assign(existing, achievement);
    } else {
      db.achievements.push(achievement);
      audit(admin, 'achievement.create', achievement.name, '', `${achievement.xpReward} XP`);
    }
    commit();
  },

  removeAchievement(id: string, admin: string) {
    const achievement = db.achievements.find((a) => a.id === id);
    db.achievements = db.achievements.filter((a) => a.id !== id);
    if (achievement) audit(admin, 'achievement.delete', achievement.name, '', '');
    commit();
  },

  saveChallenge(challenge: Challenge, admin: string) {
    const existing = db.challenges.find((c) => c.id === challenge.id);
    if (existing) {
      audit(admin, 'challenge.update', challenge.name, String(existing.xpReward), String(challenge.xpReward));
      Object.assign(existing, challenge);
    } else {
      db.challenges.push(challenge);
      audit(admin, 'challenge.create', challenge.name, '', `${challenge.period}, ${challenge.xpReward} XP`);
    }
    commit();
  },

  removeChallenge(id: string, admin: string) {
    const challenge = db.challenges.find((c) => c.id === id);
    db.challenges = db.challenges.filter((c) => c.id !== id);
    if (challenge) audit(admin, 'challenge.delete', challenge.name, '', '');
    commit();
  },

  saveAd(ad: AdUnit, admin: string) {
    const existing = db.ads.find((a) => a.id === ad.id);
    if (existing) {
      audit(admin, 'ad.update', ad.name, String(existing.enabled), String(ad.enabled));
      Object.assign(existing, ad);
    } else {
      db.ads.push(ad);
      audit(admin, 'ad.create', ad.name, '', ad.placement);
    }
    commit();
  },

  removeAd(id: string, admin: string) {
    const ad = db.ads.find((a) => a.id === id);
    db.ads = db.ads.filter((a) => a.id !== id);
    if (ad) audit(admin, 'ad.delete', ad.name, '', '');
    commit();
  },

  resolveReport(id: string, status: Report['status'], admin: string) {
    const report = db.reports.find((r) => r.id === id);
    if (!report) return;
    audit(admin, `report.${status}`, report.id, report.status, status);
    report.status = status;
    commit();
  },

  saveSeo(record: SeoRecord, admin: string) {
    const existing = db.seo.find((s) => s.route === record.route);
    if (existing) {
      audit(admin, 'seo.update', record.route, existing.title, record.title);
      Object.assign(existing, record);
    } else {
      db.seo.push(record);
      audit(admin, 'seo.create', record.route, '', record.title);
    }
    commit();
  },

  saveRedirect(redirect: RedirectRule, admin: string) {
    const existing = db.redirects.find((r) => r.id === redirect.id);
    if (existing) Object.assign(existing, redirect);
    else db.redirects.push(redirect);
    audit(admin, 'redirect.save', redirect.from, '', redirect.to);
    commit();
  },

  removeRedirect(id: string, admin: string) {
    db.redirects = db.redirects.filter((r) => r.id !== id);
    audit(admin, 'redirect.delete', id, '', '');
    commit();
  },

  saveCrm(message: CrmMessage, admin: string, send: boolean) {
    const existing = db.crm.find((m) => m.id === message.id);
    const payload = { ...message, status: send ? ('sent' as const) : message.status, sentAt: send ? new Date().toISOString() : message.sentAt, recipients: send ? 1284 : message.recipients };
    if (existing) Object.assign(existing, payload);
    else db.crm.unshift(payload);
    audit(admin, send ? 'crm.send' : 'crm.save', message.subject, '', payload.status);
    commit();
  },

  removeCrm(id: string, admin: string) {
    db.crm = db.crm.filter((m) => m.id !== id);
    commit();
  },

  addMedia(asset: { name: string; kind: 'image' | 'avatar' | 'document'; size: number; url: string }, admin: string) {
    db.media.unshift({ id: uid('md'), createdAt: new Date().toISOString(), ...asset });
    audit(admin, 'media.upload', asset.name, '', `${Math.round(asset.size / 1024)} KB`);
    commit();
  },

  renameMedia(id: string, name: string, admin: string) {
    const asset = db.media.find((m) => m.id === id);
    if (!asset) return;
    audit(admin, 'media.rename', asset.name, asset.name, name);
    asset.name = name;
    commit();
  },

  removeMedia(id: string, admin: string) {
    const asset = db.media.find((m) => m.id === id);
    db.media = db.media.filter((m) => m.id !== id);
    if (asset) audit(admin, 'media.delete', asset.name, '', '');
    commit();
  },

  activeAd(placement: AdUnit['placement']): AdUnit | undefined {
    const now = new Date().toISOString().slice(0, 10);
    return db.ads
      .filter((a) => a.enabled && a.placement === placement && a.startDate <= now && a.endDate >= now)
      .sort((a, b) => a.priority - b.priority)[0];
  },
};

type AvatarDefLike = import('@/types').AvatarDef;

export { db };
