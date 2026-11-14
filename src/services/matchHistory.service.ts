import { apiGet } from './apiClient';

export interface MatchHistoryItem { matchId: string; roomName: string; completedAt: string; durationSeconds: number; username: string; avatarId: string; score: number; placement: number; isWinner: boolean; playerCount: number; roundsCompleted: number }
export interface MatchDetail { matchId: string; roomName: string; completedAt: string; durationSeconds: number; configuration: Record<string, unknown>; players: Array<{ username: string; avatarId: string; score: number; placement: number; isWinner: boolean }> }
export const matchHistoryService = {
  mine: (limit = 20, offset = 0) => apiGet<MatchHistoryItem[]>(`/api/matches/me?limit=${limit}&offset=${offset}`),
  player: (username: string, limit = 20, offset = 0) => apiGet<MatchHistoryItem[]>(`/api/matches/player/${encodeURIComponent(username)}?limit=${limit}&offset=${offset}`, { auth: 'none' }),
  detail: (matchId: string) => apiGet<MatchDetail>(`/api/matches/${encodeURIComponent(matchId)}`, { auth: 'none' }),
  admin: (limit = 20, offset = 0) => apiGet<MatchDetail[]>(`/api/matches/admin?limit=${limit}&offset=${offset}`),
};
