import {
  BookOpen, CalendarDays, Eye, Medal, Palette, PenTool, Sparkles, Target, TrendingUp, Trophy, Users, Zap, type LucideIcon,
} from 'lucide-react';
import type { Achievement, Title } from '@/types';
import { achievementImage, titleImage } from '@/data/assets';

const FALLBACK: Record<string, LucideIcon> = {
  sparkles: Sparkles, eye: Eye, target: Target, pen: PenTool, palette: Palette, trophy: Trophy,
  medal: Medal, zap: Zap, calendar: CalendarDays, users: Users, book: BookOpen, trending: TrendingUp,
};

/* Generated achievement emblem. Falls back to the semantic Lucide icon when an
   achievement has no generated image (e.g. admin-created records). Locked
   achievements render grayscale and dimmed via the .locked class. */
export function AchievementIcon({ achievement, size = 40, unlocked = true, className = '' }: {
  achievement: Achievement; size?: number; unlocked?: boolean; className?: string;
}) {
  const src = achievement.image ?? achievementImage(achievement.id);
  const Icon = FALLBACK[achievement.icon] ?? Sparkles;
  return (
    <span
      className={`emblem ach-emblem ${unlocked ? '' : 'locked'} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={achievement.name}
    >
      {src
        ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />
        : <Icon size={Math.round(size * 0.5)} aria-hidden />}
    </span>
  );
}

/* Generated title symbol. Decorative support for the adjacent title text, so it
   carries an empty alt. Titles without a generated symbol render nothing. */
export function TitleIcon({ title, size = 18, className = '' }: { title: Title; size?: number; className?: string }) {
  const src = title.image ?? titleImage(title.id);
  if (!src) return null;
  return (
    <img
      className={`emblem title-emblem ${className}`}
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

/* Standalone generated emblem for reward previews and other supporting visuals. */
export function Emblem({ src, size = 28, className = '' }: { src: string; size?: number; className?: string }) {
  return (
    <span className={`emblem ${className}`} style={{ width: size, height: size }} aria-hidden>
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />
    </span>
  );
}