/* Centralized paths for the generated DrawSpace visual assets.
   Single source of truth so components never hardcode asset paths.
   IDs map to the existing data records; user data is never rewritten. */

export const BRAND = {
  icon: '/assets/brand/drawspace-icon.webp',
  ogHome: 'https://drawspace.cloud/assets/social/og-drawspace-home.webp',
} as const;

/* The ten generated avatars map onto the existing av-01..av-10 records.
   av-11 (Zephyr) and av-12 (Lyra) predate the generated set and keep their
   inline vector fallback so existing selections never break. */
export const AVATAR_IMAGES: Record<string, string> = {
  'av-01': '/assets/avatars/avatar-orbit.webp',
  'av-02': '/assets/avatars/avatar-prism.webp',
  'av-03': '/assets/avatars/avatar-nova.webp',
  'av-04': '/assets/avatars/avatar-pixel.webp',
  'av-05': '/assets/avatars/avatar-comet.webp',
  'av-06': '/assets/avatars/avatar-quartz.webp',
  'av-07': '/assets/avatars/avatar-echo.webp',
  'av-08': '/assets/avatars/avatar-flux.webp',
  'av-09': '/assets/avatars/avatar-halo.webp',
  'av-10': '/assets/avatars/avatar-onyx.webp',
};

/* Each generated emblem is assigned to the closest existing achievement.
   Names, descriptions, unlock conditions and XP rewards are unchanged. */
export const ACHIEVEMENT_IMAGES: Record<string, string> = {
  'a-first': '/assets/achievements/first-guess.webp',
  'a-guess10': '/assets/achievements/streak-master.webp',
  'a-guess100': '/assets/achievements/word-master.webp',
  'a-draw1': '/assets/achievements/challenge-master.webp',
  'a-draw50': '/assets/achievements/perfect-artist.webp',
  'a-win1': '/assets/achievements/winner.webp',
  'a-win25': '/assets/achievements/elite-player.webp',
  'a-fast': '/assets/achievements/speed-legend.webp',
  'a-streak7': '/assets/achievements/dedicated-player.webp',
  'a-social': '/assets/achievements/social-player.webp',
  'a-hard': '/assets/achievements/legend.webp',
  'a-level10': '/assets/achievements/xp-collector.webp',
};

/* Title symbols support the title text; they never replace it.
   t-streak and t-guardian have no generated symbol and render text-only. */
export const TITLE_IMAGES: Record<string, string> = {
  't-newcomer': '/assets/titles/rookie.webp',
  't-guesser': '/assets/titles/guesser.webp',
  't-artist': '/assets/titles/artist.webp',
  't-wordsmith': '/assets/titles/word-master.webp',
  't-champion': '/assets/titles/champion.webp',
  't-founder': '/assets/titles/legend.webp',
};

export const avatarImage = (id: string): string | undefined => AVATAR_IMAGES[id];
export const achievementImage = (id: string): string | undefined => ACHIEVEMENT_IMAGES[id];
export const titleImage = (id: string): string | undefined => TITLE_IMAGES[id];

/* Reward previews reuse the achievement emblems (XP progression, challenge completion). */
export const REWARD_IMAGES = {
  xp: ACHIEVEMENT_IMAGES['a-level10'],
  challenge: ACHIEVEMENT_IMAGES['a-draw1'],
};