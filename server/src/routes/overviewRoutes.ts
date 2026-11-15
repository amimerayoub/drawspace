import { Router } from 'express';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import type { JwtVerifier } from '../auth/verifyJwt';
import { requireAuth } from '../auth/middleware';
import { requireAdmin } from '../middleware/authorize';
import type { AdminRoleRepository } from '../repositories/adminRoleRepository';
import type { GameEngine } from '../game/engine';
import type { MatchHistoryRepository } from '../repositories/matchHistoryRepository';
import { RowRepository } from '../repositories/rowRepository';

export interface OverviewDependencies {
  database: AppwriteDatabase;
  game: GameEngine;
  matchHistory: MatchHistoryRepository;
}

export interface OverviewActivity { id: string; admin: string; action: string; target: string; at: string; status: string }
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

// A missing table (for example match_history before its migration) degrades to null
// rather than failing the whole overview, so the UI can show "not connected yet".
async function countRows(database: AppwriteDatabase, tableId: string, queries: string[] = []): Promise<number | null> {
  try {
    const result = await database.tables.listRows(database.databaseId, tableId, [...queries, Query.limit(1)]);
    return typeof result.total === 'number' ? result.total : null;
  } catch {
    return null;
  }
}

async function countUsers(database: AppwriteDatabase, activeOnly: boolean): Promise<number | null> {
  try {
    const queries = activeOnly ? [Query.equal('status', true), Query.limit(1)] : [Query.limit(1)];
    const result = await database.users.list({ queries, total: true });
    return typeof result.total === 'number' ? result.total : null;
  } catch {
    return null;
  }
}

export function overviewRoutes(verify: JwtVerifier, roles: AdminRoleRepository, deps: OverviewDependencies): Router {
  const router = Router();
  const audit = new RowRepository(deps.database, 'audit_logs');

  router.get('/', requireAuth(verify), requireAdmin(roles), async (_request, response, next) => {
    try {
      const [userTotal, userActive, blogTotal, blogPublished, blogDrafts, wordsTotal, wordsActive, reportsTotal, reportsOpen, reportsResolved, reportsDismissed] = await Promise.all([
        countUsers(deps.database, false),
        countUsers(deps.database, true),
        countRows(deps.database, 'blog_posts'),
        countRows(deps.database, 'blog_posts', [Query.equal('status', 'published')]),
        countRows(deps.database, 'blog_posts', [Query.equal('status', 'draft')]),
        countRows(deps.database, 'custom_words'),
        countRows(deps.database, 'custom_words', [Query.equal('isActive', true)]),
        countRows(deps.database, 'moderation_reports'),
        countRows(deps.database, 'moderation_reports', [Query.equal('status', 'pending')]),
        countRows(deps.database, 'moderation_reports', [Query.equal('status', 'resolved')]),
        countRows(deps.database, 'moderation_reports', [Query.equal('status', 'dismissed')]),
      ]);

      const rooms = await deps.game.listAll();
      const roomMetrics = { total: rooms.length, waiting: 0, playing: 0, finished: 0, players: 0 };
      for (const room of rooms) {
        if (room.status === 'waiting') roomMetrics.waiting += 1;
        else if (room.status === 'finished' || room.status === 'closed') roomMetrics.finished += 1;
        else roomMetrics.playing += 1;
        if (room.status !== 'finished' && room.status !== 'closed') {
          for (const player of room.players.values()) if (player.connected) roomMetrics.players += 1;
        }
      }

      let matchesTotal: number | null = null;
      try { matchesTotal = (await deps.matchHistory.listAll(1, 0)).total; } catch { matchesTotal = null; }

      let recentActivity: OverviewActivity[] = [];
      try {
        const rows = await audit.list([Query.orderDesc('createdAt'), Query.limit(12)]);
        recentActivity = rows
          .map((row) => ({ id: String(row.id ?? row.$id), admin: String(row.actorUsername ?? 'Admin'), action: String(row.action ?? ''), target: String(row.resourceId ?? ''), at: String(row.createdAt ?? ''), status: String(row.status ?? 'success') }))
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 12);
      } catch { recentActivity = []; }

      const overview: PlatformOverview = {
        users: { total: userTotal, active: userActive },
        rooms: roomMetrics,
        matches: { total: matchesTotal },
        blog: { total: blogTotal, published: blogPublished, drafts: blogDrafts },
        words: { total: wordsTotal, active: wordsActive },
        reports: { total: reportsTotal, open: reportsOpen, resolved: reportsResolved, dismissed: reportsDismissed },
        recentActivity,
        generatedAt: new Date().toISOString(),
      };
      response.json({ data: overview });
    } catch (error) { next(error); }
  });

  return router;
}