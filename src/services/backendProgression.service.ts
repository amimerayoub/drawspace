import { apiGet, apiPost } from './apiClient';
import type { Achievement, Challenge, LeaderboardEntry, RewardEntry, Title } from '@/types';

export interface ProgressionSnapshot {
  progression: { totalXP: number; level: number; highestLevel: number; equippedTitleId: string | null; into: number; needed: number };
  statistics: { totalGames: number; gamesWon: number; totalGuesses: number; correctGuesses: number; totalPoints: number; winRate: number };
  achievements: Achievement[];
  titles: Title[];
  challenges: Challenge[];
  rewards: RewardEntry[];
}
export interface LiveLeaderboardEntry extends Omit<LeaderboardEntry, 'userId'> { isMe: boolean; titleName: string | null; titleDescription: string | null; titleImage: string | null; }

export const backendProgressionService = {
  getMine: () => apiGet<ProgressionSnapshot>('/api/progression/me'),
  leaderboard: () => apiGet<LiveLeaderboardEntry[]>('/api/progression/leaderboard'),
  publicAchievements: () => apiGet<Achievement[]>('/api/progression/achievements', { auth: 'none' }),
  equipTitle: (titleId: string | null) => apiPost<{ equippedTitleId: string | null }>('/api/progression/titles/equip', { titleId }),
  claimChallenge: (id: string) => apiPost<{ xp: number }>(`/api/progression/challenges/${encodeURIComponent(id)}/claim`, {}),
};
