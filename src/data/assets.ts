/* Centralized paths for the generated DrawSpace visual assets.
   Single source of truth so components never hardcode asset paths.
   IDs map to the existing data records; user data is never rewritten. */

export const BRAND = {
  icon: '/assets/brand/drawspace-icon.png',
  ogHome: 'https://drawspace.cloud/assets/social/og-drawspace-home.webp',
} as const;

/* The ten generated avatars map onto the existing av-01..av-10 records.
   av-11 (Zephyr) and av-12 (Lyra) predate the generated set and keep their
   inline vector fallback so existing selections never break. */
export const AVATAR_IMAGES: Record<string, string> = {
  'av-01': '/assets/avatars/avatar-orbit.png',
  'av-02': '/assets/avatars/avatar-prism.png',
  'av-03': '/assets/avatars/avatar-nova.png',
  'av-04': '/assets/avatars/avatar-pixel.png',
  'av-05': '/assets/avatars/avatar-comet.png',
  'av-06': '/assets/avatars/avatar-quartz.png',
  'av-07': '/assets/avatars/avatar-echo.png',
  'av-08': '/assets/avatars/avatar-flux.png',
  'av-09': '/assets/avatars/avatar-halo.png',
  'av-10': '/assets/avatars/avatar-onyx.png',
};

/* Each generated emblem is assigned to the closest existing achievement.
   Names, descriptions, unlock conditions and XP rewards are unchanged. */
export const ACHIEVEMENT_IMAGES: Record<string, string> = {
  'a-first': '/assets/achievements/first-guess.png',
  'a-guess10': '/assets/achievements/streak-master.png',
  'a-guess100': '/assets/achievements/word-master.png',
  'a-draw1': '/assets/achievements/challenge-master.png',
  'a-draw50': '/assets/achievements/perfect-artist.png',
  'a-win1': '/assets/achievements/winner.png',
  'a-win25': '/assets/achievements/elite-player.png',
  'a-fast': '/assets/achievements/speed-legend.png',
  'a-streak7': '/assets/achievements/dedicated-player.png',
  'a-social': '/assets/achievements/social-player.png',
  'a-hard': '/assets/achievements/legend.png',
  'a-level10': '/assets/achievements/xp-collector.png',
};

/* Title symbols support the title text; they never replace it.
   t-streak and t-guardian have no generated symbol and render text-only. */
export const TITLE_IMAGES: Record<string, string> = {
  't-newcomer': '/assets/titles/rookie.png',
  't-guesser': '/assets/titles/guesser.png',
  't-artist': '/assets/titles/artist.png',
  't-wordsmith': '/assets/titles/word-master.png',
  't-champion': '/assets/titles/champion.png',
  't-founder': '/assets/titles/legend.png',
};

export const avatarImage = (id: string): string | undefined => AVATAR_IMAGES[id];
export const achievementImage = (id: string): string | undefined => ACHIEVEMENT_IMAGES[id];
export const titleImage = (id: string): string | undefined => TITLE_IMAGES[id];

/* Reward previews reuse the achievement emblems (XP progression, challenge completion). */
export const REWARD_IMAGES = {
  xp: ACHIEVEMENT_IMAGES['a-level10'],
  challenge: ACHIEVEMENT_IMAGES['a-draw1'],
};