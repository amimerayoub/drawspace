import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/services/apiClient';
import { backendAdminService } from '@/services/backendAdmin.service';
import { backendProgressionService } from '@/services/backendProgression.service';
import { contentService, type BlogListQuery } from '@/services/content.service';
import type { PlatformConfig } from '@/context/PlatformConfigContext';
import type { AdPlacement } from '@/types';

export const queryKeys = {
  leaderboard: ['leaderboard'] as const,
  blogList: (params: BlogListQuery) => ['blogs', 'list', params] as const,
  blogArticle: (slug: string) => ['blogs', 'article', slug] as const,
  publicAchievements: ['achievements', 'public'] as const,
  progression: (userId: string) => ['progression', userId] as const,
  platformConfig: ['platform-config'] as const,
  ad: (placement: AdPlacement) => ['ads', placement] as const,
};

export function useLeaderboard() {
  return useQuery({
    queryKey: queryKeys.leaderboard,
    queryFn: () => backendProgressionService.leaderboard(),
    staleTime: 60_000,
  });
}

export function usePublicBlogs(params: BlogListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.blogList(params),
    queryFn: () => contentService.publicBlogs(params),
    staleTime: 5 * 60_000,
  });
}

export function usePublicBlog(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.blogArticle(slug ?? ''),
    queryFn: () => contentService.publicBlog(slug!),
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
  });
}

export function usePublicAchievements() {
  return useQuery({
    queryKey: queryKeys.publicAchievements,
    queryFn: () => backendProgressionService.publicAchievements(),
    staleTime: 5 * 60_000,
  });
}

export function useProgression(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.progression(userId ?? ''),
    queryFn: () => backendProgressionService.getMine(),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useInvalidateProgression() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['progression'] });
}

export function usePlatformConfigQuery() {
  return useQuery({
    queryKey: queryKeys.platformConfig,
    queryFn: () => apiGet<PlatformConfig>('/api/platform/config', { auth: 'none' }),
    staleTime: 5 * 60_000,
  });
}

export function useActiveAd(placement: AdPlacement) {
  return useQuery({
    queryKey: queryKeys.ad(placement),
    queryFn: () => backendAdminService.activeAd(placement),
    staleTime: 5 * 60_000,
  });
}