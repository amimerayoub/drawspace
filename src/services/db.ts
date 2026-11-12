import {
  ACHIEVEMENTS, ADS, ARTICLES, AUDIT, AVATARS, CHALLENGES, CRM_MESSAGES, GAME_CONFIG,
  LEADERBOARD, MATCHES, MEDIA, PUBLIC_ROOMS, REDIRECTS, REPORTS, REWARDS, ROLE_PERMISSIONS,
  SEO_RECORDS, SYSTEM_SETTINGS, TITLES, USERS, WORDS, XP_CONFIG,
} from '@/data/mock';
import type {
  Achievement, AdUnit, Article, AuditEntry, AvatarDef, Challenge, CrmMessage, GameConfig,
  LeaderboardEntry, MatchRecord, MediaAsset, Report, RewardEntry, Room, RedirectRule,
  SeoRecord, SystemSettings, Title, User, Word, XpConfig,
} from '@/types';

export interface Db {
  users: User[];
  avatars: AvatarDef[];
  words: Word[];
  rooms: Room[];
  achievements: Achievement[];
  titles: Title[];
  challenges: Challenge[];
  rewards: RewardEntry[];
  matches: MatchRecord[];
  leaderboard: LeaderboardEntry[];
  articles: Article[];
  ads: AdUnit[];
  media: MediaAsset[];
  audit: AuditEntry[];
  reports: Report[];
  seo: SeoRecord[];
  redirects: RedirectRule[];
  crm: CrmMessage[];
  gameConfig: GameConfig;
  xpConfig: XpConfig;
  settings: SystemSettings;
  rolePermissions: Record<string, string[]>;
}

const KEY = 'drawspace:db:v1';

function seed(): Db {
  return structuredClone({
    users: USERS, avatars: AVATARS, words: WORDS, rooms: PUBLIC_ROOMS,
    achievements: ACHIEVEMENTS, titles: TITLES, challenges: CHALLENGES, rewards: REWARDS,
    matches: MATCHES, leaderboard: LEADERBOARD, articles: ARTICLES, ads: ADS, media: MEDIA,
    audit: AUDIT, reports: REPORTS, seo: SEO_RECORDS, redirects: REDIRECTS, crm: CRM_MESSAGES,
    gameConfig: GAME_CONFIG, xpConfig: XP_CONFIG, settings: SYSTEM_SETTINGS,
    rolePermissions: ROLE_PERMISSIONS,
  });
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.users && parsed.words && parsed.settings) return parsed;
    }
  } catch {
    /* corrupted storage falls back to seed */
  }
  return seed();
}

export const db: Db = load();

const listeners = new Set<() => void>();

export function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage may be unavailable; state still lives in memory */
  }
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let counter = Date.now();
export function uid(prefix: string) {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

export function resetDb() {
  Object.assign(db, seed());
  commit();
}