import express from 'express';
import cors from 'cors';
import type { ServerConfig } from './config/env';
import type { AppwriteDatabase } from './database/appwrite';
import type { JwtVerifier } from './auth/verifyJwt';
import { createJwtVerifier } from './auth/verifyJwt';
import { AdminRoleRepository } from './repositories/adminRoleRepository';
import { GuestRepository } from './repositories/guestRepository';
import { PreferencesRepository } from './repositories/preferencesRepository';
import { ProfileRepository } from './repositories/profileRepository';
import { StatisticsRepository } from './repositories/statisticsRepository';
import { ModerationReportRepository } from './repositories/moderationReportRepository';
import { GameEngine } from './game/engine';
import { rateLimit } from './middleware/rateLimit';
import { errorHandler, notFound } from './middleware/errors';
import { HttpError } from './middleware/errors';
import { adminRoutes } from './routes/adminRoutes';
import { authRoutes } from './routes/authRoutes';
import { guestRoutes } from './routes/guestRoutes';
import { preferencesRoutes } from './routes/preferencesRoutes';
import { profileRoutes } from './routes/profileRoutes';
import { statisticsRoutes } from './routes/statisticsRoutes';
import { reportRoutes } from './routes/reportRoutes';
import { progressionRoutes } from './routes/progressionRoutes';
import { ProgressionRepository } from './repositories/progressionRepository';
import { AdminDataRepository } from './repositories/adminDataRepository';
import { AdminUserRepository } from './repositories/adminUserRepository';
import { contentRoutes, publicAdRoutes, publicBlogRoutes } from './routes/contentRoutes';
import { contentApiV1Routes } from './routes/contentApiV1';
import { mcpAdminApiV1Routes } from './routes/mcpAdminApiV1';
import { McpKeyService } from './mcp/keyService';
import { mcpRoutes } from './mcp/http';
import { BlogService } from './content/blogService';
import { WordService } from './content/wordService';
import { CatalogRepository } from './repositories/catalogRepository';
import { catalogRoutes } from './routes/catalogRoutes';
import { GameSettingsRepository } from './repositories/gameSettingsRepository';
import { gameSettingsRoutes } from './routes/gameSettingsRoutes';
import { InMemoryRoomStateStore, type RoomStateStore } from './state/roomStateStore';
import { AppwriteMatchHistoryRepository, type MatchHistoryRepository } from './repositories/matchHistoryRepository';
import { matchRoutes } from './routes/matchRoutes';

export interface ApplicationDependencies {
  config: ServerConfig;
  database: AppwriteDatabase;
  verifyJwt?: JwtVerifier;
  game?: GameEngine;
  roomStateStore?: RoomStateStore;
  matchHistoryRepository?: MatchHistoryRepository;
}

export function createApp(deps: ApplicationDependencies) {
  const app = express();
  const verify = deps.verifyJwt ?? createJwtVerifier(deps.database);
  const profiles = new ProfileRepository(deps.database);
  const preferences = new PreferencesRepository(deps.database);
  const statistics = new StatisticsRepository(deps.database);
  const guests = new GuestRepository(deps.database);
  const roles = new AdminRoleRepository(deps.database);
  const reports = new ModerationReportRepository(deps.database);
  const progression = new ProgressionRepository(deps.database);
  const adminData = new AdminDataRepository(deps.database);
  const wordService = new WordService(deps.database);
  const blogService = new BlogService(deps.database);
  const mcpKeys = new McpKeyService(deps.database, deps.config.mcpApiKey, deps.config.mcpScopes);
  const adminUsers = new AdminUserRepository(deps.database, roles);
  const catalog = new CatalogRepository(deps.database);
  const gameSettings = new GameSettingsRepository(deps.database);
  const matchHistory = deps.matchHistoryRepository ?? new AppwriteMatchHistoryRepository(deps.database);
  const stateStore = deps.roomStateStore ?? new InMemoryRoomStateStore();
  const game = deps.game ?? new GameEngine(Date.now, stateStore);

  if (deps.config.nodeEnv === 'production') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  });
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || deps.config.frontendOrigins.includes(origin)) callback(null, true);
      else callback(new HttpError(403, 'Origin is not allowed', 'CORS_DENIED'));
    },
  }));
  const jsonBody = express.json({ limit: '256kb', strict: true });
  // Import payloads and MCP requests carry whole files and get dedicated larger parsers.
  app.use((request, response, next) => (request.path.startsWith('/api/v1/admin/import/') || request.path === '/mcp' || request.path.startsWith('/mcp/') ? next() : jsonBody(request, response, next)));
  app.use('/api', rateLimit(240, 60_000));
  app.use('/api/auth', rateLimit(60, 60_000), authRoutes(verify));
  app.use('/api/profiles', profileRoutes(verify, profiles));
  app.use('/api/preferences', preferencesRoutes(verify, preferences));
  app.use('/api/statistics', statisticsRoutes(verify, statistics));
  app.use('/api/guest', rateLimit(20, 60_000), guestRoutes(verify, guests, profiles));
  app.use('/api/admin', rateLimit(60, 60_000), adminRoutes(verify, roles, reports, adminUsers));
  app.use('/api/reports', rateLimit(20, 60_000), reportRoutes(verify, reports, game));
  app.use('/api/progression', progressionRoutes(verify, progression));
  app.use('/api/matches', rateLimit(60, 60_000), matchRoutes(verify, matchHistory, profiles, roles));
  app.use('/api/admin/content', contentRoutes(verify, roles, adminData));
  app.use('/api/admin/catalog', catalogRoutes(verify, roles, catalog));
  app.use('/api/admin/game-settings', gameSettingsRoutes(verify, roles, gameSettings));
  app.use('/api/blog', publicBlogRoutes(adminData));
  app.use('/api/ads', publicAdRoutes(adminData));
  app.use('/api/v1/admin/mcp', rateLimit(60, 60_000), mcpAdminApiV1Routes(verify, roles, mcpKeys, deps.database));
  app.use('/api/v1', rateLimit(120, 60_000), contentApiV1Routes(verify, roles, wordService, blogService));
  app.use('/mcp', mcpRoutes(mcpKeys, wordService, blogService));

  app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'drawspace-api' }));
  app.get('/health/ready', async (_request, response) => {
    try {
      const tables = await deps.database.tables.listTables(deps.database.databaseId);
      const stateOk = await stateStore.isHealthy();
      if (!stateOk) { response.status(503).json({ status: 'not_ready', database: { ok: true, tables: tables.total }, roomState: { driver: deps.config.roomStateDriver, ok: false } }); return; }
      response.json({ status: 'ready', database: { ok: true, tables: tables.total }, roomState: { driver: deps.config.roomStateDriver, ok: true } });
    } catch {
      response.status(503).json({ status: 'not_ready', database: { ok: false }, roomState: { driver: deps.config.roomStateDriver, ok: false } });
    }
  });
  app.get('/api/rooms', async (_request, response, next) => {
    try {
      const rooms = await game.listPublic();
      response.json({ data: rooms.map((room) => {
        const full = game.publicRoom(room);
        return {
          code: full.code, name: full.name, status: full.status, settings: full.settings,
          players: full.players.map(({ username, avatarId, connected, host }) => ({ username, avatarId, connected, host })),
        };
      }) });
    } catch (error) { next(error); }
  });
  app.use(notFound);
  app.use(errorHandler);
  return { app, game, verify, stateStore, repositories: { profiles, preferences, statistics, guests, roles, reports, progression, adminData, adminUsers, catalog, gameSettings, matchHistory, wordService, blogService } };
}
