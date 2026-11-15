export type Locale = 'en-US' | 'en-GB' | 'fr' | 'es' | 'de' | 'ar' | 'pt-BR' | 'ru';
export type Theme = 'dark' | 'light';
export type Role = 'guest' | 'player' | 'support' | 'moderator' | 'content_manager' | 'analyst' | 'admin' | 'superadmin';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomVisibility = 'public' | 'private';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type ArticleStatus = 'draft' | 'published' | 'scheduled';
export type AdPlacement = 'landing' | 'blog';
export type ChallengePeriod = 'daily' | 'weekly' | 'special';

export interface AvatarDef {
  id: string;
  name: string;
  shape: number;
  image?: string;
  enabled: boolean;
  isDefault: boolean;
  order: number;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  avatarId: string;
  bio: string;
  role: Role;
  status: UserStatus;
  level: number;
  xp: number;
  titleId: string | null;
  createdAt: string;
  lastSeenAt: string;
  stats: PlayerStats;
  locale: Locale;
}

export interface PlayerStats {
  matches: number;
  wins: number;
  correctGuesses: number;
  wordsDrawn: number;
  totalScore: number;
  bestScore: number;
}

export interface RoomSettings {
  name: string;
  visibility: RoomVisibility;
  password: string;
  maxPlayers: number;
  rounds: number;
  roundSeconds: number;
  difficulty: Difficulty;
  wordMode: 'all' | 'easy' | 'medium' | 'hard' | 'custom';
  customWords: string[];
}

export interface Room {
  code: string;
  name: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  password?: string;
  hostId: string;
  players: RoomPlayer[];
  settings: RoomSettings;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: string;
}

export interface RoomPlayer {
  id: string;
  username: string;
  avatarId: string;
  score: number;
  isHost: boolean;
  isBot: boolean;
  guessed: boolean;
}

export interface Word {
  id: string;
  text: string;
  difficulty: Difficulty;
  category: string;
  definition: string;
  hint: string;
  active: boolean;
  translations: Partial<Record<Locale, string>>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  image?: string;
  xpReward: number;
  condition: string;
  active: boolean;
  unlockedAt?: string;
  progress?: number;
  goal?: number;
}

export interface Title {
  id: string;
  name: string;
  description: string;
  image?: string;
  xpReward: number;
  condition: string;
  active: boolean;
  unlocked: boolean;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  period: ChallengePeriod;
  objective: number;
  progress: number;
  xpReward: number;
  startsAt: string;
  endsAt: string;
  claimed: boolean;
  active: boolean;
}

export interface RewardEntry {
  id: string;
  userId: string;
  label: string;
  xp: number;
  at: string;
  kind: 'guess' | 'draw' | 'match' | 'challenge' | 'achievement';
}

export interface MatchRecord {
  id: string;
  userId: string;
  roomName: string;
  playedAt: string;
  players: number;
  placement: number;
  score: number;
  xpEarned: number;
  rounds: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarId: string;
  level: number;
  xp: number;
  wins: number;
  titleId: string | null;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  category: string;
  tags: string[];
  status: ArticleStatus;
  author: string;
  cover: string;
  createdAt: string;
  publishAt: string;
  seoTitle: string;
  seoDescription: string;
  views: number;
}

export interface AdUnit {
  id: string;
  name: string;
  placement: AdPlacement;
  enabled: boolean;
  devices: ('desktop' | 'mobile' | 'tablet')[];
  startDate: string;
  endDate: string;
  priority: number;
  body: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'image' | 'avatar' | 'document';
  size: number;
  createdAt: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  optimized?: boolean;
  widths?: number[];
  thumbUrl?: string;
  originalUrl?: string;
}

export interface AuditEntry {
  id: string;
  admin: string;
  action: string;
  target: string;
  at: string;
  before: string;
  after: string;
  status: 'success' | 'failed';
}

export interface Report {
  id: string;
  type: 'drawing' | 'chat' | 'username' | 'room';
  target: string;
  reporter: string;
  reason: string;
  at: string;
  status: 'open' | 'resolved' | 'dismissed';
  detail: string;
  moderatorNotes?: string;
  resolutionAction?: string;
  resolvedAt?: string;
}

export interface OverviewActivity {
  id: string;
  admin: string;
  action: string;
  target: string;
  at: string;
  status: string;
}

export interface PlatformOverview {
  users: { total: number | null; active: number | null };
  rooms: { total: number; waiting: number; playing: number; finished: number; players: number };
  matches: { total: number | null };
  blog: { total: number | null; published: number | null; drafts: number | null };
  words: { total: number | null; active: number | null };
  reports: { total: number | null; open: number | null; resolved: number | null; dismissed: number | null };
  recentActivity: OverviewActivity[];
  generatedAt: string;
}

export interface AnalyticsTopPlayer {
  userId: string;
  username: string;
  avatarId: string;
  xp: number;
  level: number;
  wins: number;
}

export interface PlatformAnalytics {
  range: { days: number; from: string; to: string };
  totals: { users: number | null; activeUsers: number | null; matches: number | null; wordsGuessed: number; xpAwarded: number };
  series: { labels: string[]; signups: number[]; matches: number[]; xp: number[] };
  locales: { locale: string; count: number }[];
  accountTypes: { registered: number; guest: number };
  topPlayers: AnalyticsTopPlayer[];
  matchesAvailable: boolean;
  generatedAt: string;
}

export interface SeoRecord {
  route: string;
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  robots: 'index' | 'noindex';
  structuredData: string;
}

export interface RedirectRule {
  id: string;
  from: string;
  to: string;
  code: 301 | 302;
  hits: number;
}

export interface CrmMessage {
  id: string;
  segment: string;
  subject: string;
  body: string;
  sentAt: string;
  recipients: number;
  status: 'sent' | 'draft';
}

export interface GameConfig {
  minPlayers: number;
  maxPlayers: number;
  defaultRounds: number;
  minRoundSeconds: number;
  maxRoundSeconds: number;
  wordChoiceCount: number;
  wordChoiceSeconds: number;
  hintReveal: boolean;
  skipVoteRatio: number;
  allowGuests: boolean;
}

export interface XpConfig {
  correctGuess: number;
  firstGuessBonus: number;
  drawingPerGuess: number;
  winBonus: number;
  challengeMultiplier: number;
  levelBase: number;
  levelGrowth: number;
}

export interface XpSettings {
  correctGuessXp: number;
  winBonusXp: number;
  challengeMultiplier: number;
  levelBase: number;
  levelGrowth: number;
}

export interface SystemSettings {
  siteName: string;
  tagline: string;
  maintenance: boolean;
  registrationOpen: boolean;
  guestPlay: boolean;
  defaultLocale: Locale;
  contactEmail: string;
}

export interface PermissionDef {
  id: string;
  label: string;
  group: string;
}

export type RolePermissions = Record<string, string[]>;

export interface RoleMatrixEntry {
  role: string;
  label: string;
  permissions: string[];
}

export interface PermissionMatrix {
  permissions: PermissionDef[];
  assignableRoles: string[];
  roles: RoleMatrixEntry[];
  totalPermissions: number;
}

export interface AdminRoomPlayer {
  userId: string;
  username: string;
  avatarId: string;
  score: number;
  ready: boolean;
  connected: boolean;
  host: boolean;
  isGuest: boolean;
  hasGuessed: boolean;
}

export interface AdminRoom {
  code: string;
  name: string;
  hostId: string;
  status: 'waiting' | 'choosing' | 'drawing' | 'round_end' | 'finished' | 'closed';
  visibility: 'public' | 'private';
  hasPassword: boolean;
  settings: { maxPlayers: number; rounds: number; roundSeconds: number; difficulty: string; wordMode: string };
  players: AdminRoomPlayer[];
  playerCount: number;
  connectedCount: number;
  round: number;
  rounds: number;
  turnId: number;
  drawerUserId: string | null;
  startedAt: number;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

export interface Stroke {
  id?: string;
  color: string;
  size: number;
  tool: 'pen' | 'eraser';
  points: { x: number; y: number }[];
}

export interface ChatMessage {
  id: number;
  playerId: string;
  username: string;
  text: string;
  kind: 'chat' | 'guess' | 'correct' | 'system';
  at: number;
}
