# DrawSpace Content System — Phase 0 Audit

Status: Phase 0 (inspection only, no application code modified).
Canonical project: `.worktrees/phase1-backend-rebuild` (branch `codex/phase1-backend-rebuild`).
Method: read-only inspection of the React frontend, the Express + TypeScript backend, all Appwrite SDK usage, the Appwrite TablesDB schema snapshot (`docs/appwrite-schema-inspection.json`, 24 tables, matches live `/health/ready` table count), admin authorization, API routes, and tests. Live schema must be re-verified before any migration is applied.

Constraints honored: Appwrite remains the only database/backend; existing frontend design, gameplay, auth, admin, and data are preserved; uncommitted changes preserved; no destructive git; no commit/push/deploy; no secrets printed; `platform_state.json` untouched.

---

## 1. Stack and structure

- Frontend: React 18 + TypeScript (strict) + Vite 6, React Router 6, plain CSS tokens, lucide-react. i18n: `src/i18n/en.ts` base + `translations.ts` overrides for en-GB, fr, es, de, ar, pt-BR, ru (8 locales, RTL Arabic). Game words are English-only by design.
- Backend: Express 5 + Socket.IO 4 + zod validation, `node-appwrite` TablesDB. Entry `server/src/index.ts`; app factory `server/src/app.ts`.
- Appwrite access: `server/src/database/appwrite.ts` exposes `AppwriteDatabase { accountForJwt(jwt), tables: TablesDB, users: Users, databaseId, newId() }`. Admin client uses `setKey(config.appwriteApiKey)` (from `APPWRITE_API_KEY`). `RowRepository` (`server/src/repositories/rowRepository.ts`) wraps `tables.listRows/createRow/updateRow/deleteRow` with `Query` helpers.
- Config: `server/src/config/env.ts` (zod). Requires `APPWRITE_ENDPOINT/PROJECT_ID/API_KEY`; `ROOM_STATE_DRIVER` memory|redis.

## 2. Appwrite content collections (existing)

### blog_posts (`docs/appwrite-schema-inspection.json:1412`)
`rowSecurity:false`, permission `read("any")`. Columns: `id` str(64) req, `authorName` str(64) req, `slug` str(128) req, `excerpt` str(500), `content` str(10000), `categoryId` str(32), `status` str(16) default `draft`, `featuredImage` str(255), `authorId` str(36) req, `views` int(0..10,000,000), `seoDescription` str(255), `createdAt` str(64) req, `updatedAt` str(64) req, `title` str(255) req, `publishedAt` str(64), `seoTitle` str(128). Index: `idx_slug` unique on `slug`.
- Missing for spec: `tags`. `archived` status needs NO migration (`status` is a free string(16)).

### blog_categories (`:1561`)
`read("any")`. `slug` str(64) req unique (`idx_slug`), `id` str(32) req, `description` str(255), `isActive` bool default true, `name` str(64) req.

### custom_words (`:2129`) — the ONLY word collection
`read("any")`, `rowSecurity:false`. `id` str(64) req, `category` str(32) req, `isActive` bool default true, `difficulty` str(16) req, `word` str(64) req. Index `idx_word` unique on `word` (case-sensitive).
- Missing for spec: `language`, `hint`, `createdAt`, `updatedAt`, normalized-word uniqueness. No separate `words` table exists.

### audit_logs (`:1295`)
`actorUsername, id, actorUserId, action, actorRole, ipAddress, resourceType, createdAt, status, resourceId, reason`. Indexes `idx_actor`, `idx_res`. Reused for content + MCP audit.

### admin_roles (`:1227`)
`userId, username, role, assignedAt, isActive, assignedBy`. `idx_userId` unique. Roles: `superadmin | admin | moderator | content_manager | analyst` (`server/src/repositories/adminRoleRepository.ts:5`).

Other collections (profiles, statistics, progression, catalogs, advertisements, platform_settings, moderation, etc.) are out of scope for content management but must not be disturbed.

Security note: `blog_posts` and `custom_words` are `read("any")` with `rowSecurity:false`. The public REST API filters to published posts, but a client holding the public Appwrite project id could read drafts/words directly via the Appwrite SDK. Tightening this is a separate permission-hardening task (see `docs/APPWRITE_PERMISSION_HARDENING_PLAN.md`) and requires approval; the content API itself never exposes drafts publicly.

## 3. Existing backend API surface (mounted in `server/src/app.ts:81-95`)

| Mount | Router | Auth | Operations |
|---|---|---|---|
| `/api/admin/content` | `contentRoutes.ts` | requireAuth + requireAdmin(superadmin/admin/content_manager) | GET/PUT/DELETE `words`, `blog`, `ads`; GET/PUT `settings` (admin only); GET `audit` |
| `/api/admin/catalog` | `catalogRoutes.ts` | requireAuth + requireAdmin(editors) | GET/PUT/DELETE `:kind` for avatars/titles/achievements/challenges/words |
| `/api/admin` | `adminRoutes.ts` | requireAdmin | users, roles (superadmin), reports/moderation |
| `/api/blog` | `publicBlogRoutes` | none | GET `/` (published list), GET `/:slug` |
| `/api/ads` | `publicAdRoutes` | none | GET `/:placement` |
| `/api/rooms`, `/health`, `/health/ready` | inline | none | room list / health |

- Blog write schema (`contentRoutes.ts:12`): id, slug, title, excerpt, body[] (paragraphs), category, status(draft/published/scheduled), cover, seoTitle, seoDescription, publishAt. No tags/archived.
- Word write schema (`contentRoutes.ts:11`): id, text, difficulty, category, active. No language/hint.
- Persistence: `AdminDataRepository` (`adminDataRepository.ts`) maps blog_posts/custom_words/blog_categories/audit_logs. `listPosts` loads ≤500 rows and filters in memory; `tags` always returned `[]`; word `hint`/`definition`/`translations` fabricated empty.
- No `/api/v1`, no import/export, no MCP, no public pagination/search/filter.

## 4. Word data flow and game compatibility (critical)

One collection (`custom_words`), three access paths:
1. `catalogRepository.ts:10` — catalog kind `words` → table `custom_words`; save trims/lowercases `word`, rejects duplicates; audits mutations.
2. `wordRepository.ts` — GAME read path. `active(mode)` queries `isActive=true`, `Query.limit(500)`, filters `difficulty===mode` unless all/mixed/custom. Shape `GameWord {id, word, category, difficulty}`.
3. `adminDataRepository.ts:19-31` — legacy admin word CRUD (maps word→text).

Game engine (`server/src/game/engine.ts`) accepts `WordChoice {id, word, category}` via `setWordChoices` (≥2, ≤3); word loading is in `server/src/socket/handlers.ts:248-268` (`offerWords`). Guess matching NFKD-normalizes and strips diacritics/non-alphanumerics (`engine.ts:214,364`).
Compatibility rule: any word change MUST preserve `id/word/category/difficulty/isActive`, keep difficulty in `easy|medium|hard`, and keep word text compatible with NFKD normalization. The 500-row active cap remains.

## 5. Admin authorization model

- Server-side: `requireAdmin(roles, allowed?)` (`middleware/authorize.ts:5`) → `identityFrom` → `roles.getRole(userId)` (DB lookup of `admin_roles`, `isActive=true`, role whitelist) → 403 `FORBIDDEN` if missing/not allowed; sets `response.locals.admin`.
- Auth: `requireAuth` parses `Bearer` JWT (`auth/middleware.ts`); JWT verified by Appwrite `accountForJwt(jwt).get()` (`auth/verifyJwt.ts`); `isGuest = !account.email`.
- Rate limiting: `middleware/rateLimit.ts` in-memory fixed window keyed by IP (per middleware instance; not multi-process safe). `/api` 240/min; admin/auth/matches 60/min; guest/reports 20/min.
- Errors: `HttpError {status, message, code}`; `errorHandler` maps Appwrite numeric 400/404/409/429 to generic messages, else 500 `INTERNAL_ERROR` (logs only `error.name`).
- Frontend gating is client-side only (`AdminApp.tsx:100`, `shared.tsx`): `isStaff` from `user.role`; perms hardcoded/duplicated. Backend remains the source of truth (every admin route enforces requireAdmin). New admin pages must rely on server-side authorization, not the client gate.

## 6. Frontend surfaces (exists vs missing)

Admin shell: `AdminApp.tsx` 21 routes; groups Players/Game/Rewards/Content/Operations. `content_manager` perms: words.manage, content.blog, content.ads, content.media (no content.seo).
- BlogAdmin.tsx: edits title/slug/excerpt/body/category/tags/status/cover/publishAt/seoTitle/seoDescription. Statuses draft/published/scheduled (no archived). Cover is a preset enum (no upload). No live preview (only a preview-path string). Tags NOT persisted. No bulk actions. Loads all posts (no server pagination). API `/api/admin/content/blog`.
- Words.tsx: edits text/difficulty/category/definition/hint/active/translations. definition/hint/translations NOT persisted. No duplicate detection, no category management, no bulk/import/export. API `/api/admin/content/words`.
- CatalogEditor.tsx: avatars/titles/achievements/challenges only (NOT words). An unused `/api/admin/catalog/words` endpoint exists with no UI.
- Media.tsx and Seo.tsx: DISABLED (`UnavailableFeature`) — no Appwrite Storage integration; `lib/appwrite.ts` exports only Account/Client.
- Audit.tsx: functional read-only (`/api/admin/content/audit`).
- Public Blog.tsx: GET `/api/blog`, category tabs, no search/tag filter/pagination. BlogArticle.tsx: related = first 3 others (not category/tag matched); tags non-clickable; SeoHead provides OG/Twitter but article passes only title/description (og:type defaults to website; cover not used as og:image).
- API layer: `apiClient.ts` envelope `{data, error, code}` (NO `success` field), JWT Bearer, 12s timeout, PUT for upserts. `backendAdmin.service.ts` exposes catalog/words/articles/ads/settings/audit methods.

## 7. Import/export and MCP status

- No CSV/JSON import or export code exists (grep for mcp/modelcontextprotocol/csv parse/export found nothing).
- No MCP server, no MCP key management, no `/api/v1`.
- These are net-new (Phases 3–9).

## 8. Tests inventory (`server/src/**/*.test.ts`, node:test)

Offline (13, run with `npm run server:test`): auth/middleware, middleware/authorize, catalogRepository, profileRepository, progressionRepository, matchHistoryRepository, gameSettingsRoutes, roomStateStore, config/env, game/engine, matchPersistenceService, redisSharedState (fake Redis), httpE2e (full app + Socket.IO against an `IsolatedTables` double — offline).
Integration (3, auto-skip without env): appwrite.integration (`APPWRITE_TEST_*`), redisRoomState.integration + redisAdapter.integration (`REDIS_TEST_URL`).
New content/MCP tests should follow the offline `IsolatedTables`/fake-db pattern so they run without live services; live integration is gated on env + approval.

## 9. Gap analysis vs specification

| Phase | Exists | Missing / to build |
|---|---|---|
| 1 Blog | CRUD, draft/published/scheduled, SEO fields, slug dedupe, searchable table | tags persistence, archived status, Markdown editor + live preview, cover upload (Storage), category taxonomy UI, bulk actions, server pagination/search/filter, view tracking endpoint, publish/archive endpoints |
| 2 Words | CRUD + active toggle, difficulty | language/hint persistence, normalized duplicate detection, configurable categories, bulk create/activate/delete, server pagination/filter, stats |
| 3 Import | none | JSON/CSV import: parse, validate, preview, duplicate detection, strategies (insert/skip/update/replace-selected), partial-failure report, limits, server-side validation |
| 4 Export | none | JSON/CSV export with filters, UTF-8, RFC4180 escaping, formula-injection protection, versioned JSON, timestamps, safe pagination |
| 5 Examples | none | examples/content-import/* + guide |
| 6 Content API | legacy /api/admin/content + /api/blog | documented /api/v1 blog/word/import/export, pagination/filter/validation/rate limit, docs/DRAWSPACE_API.md |
| 7 MCP | none | secure MCP server (Streamable HTTP), dedicated hashed/scoped/revocable/rotatable/audited keys, blog/word/import-export/analytics tools, least privilege + confirmation |
| 8 Public API | /api/blog (no pagination) | /api/v1/public/blogs + /:slug with pagination/category/tags/search/published-only/SEO |
| 9 MCP docs | none | docs/MCP_SETUP.md, MCP_SECURITY.md |
| 10 Admin UI | blog/word/audit pages | upgraded blog/word pages, import/export UI, MCP management page (keys/scopes/audit/show-once) |
| 11 Security | server admin auth, rate limit, validation | MCP key hashing/scopes, CSV formula protection, file limits, safe JSON parse, audit, no arbitrary queries |
| 12 Tests | 13 offline + 3 integration | blog/word/import-export/MCP tests; honest PASSED/FAILED/BLOCKED/SKIPPED report |
| 13 Deliverables | some docs | all required docs + examples + final report |

## 10. Conventions to preserve

- REST envelope `{data, error, code}` (no `success`) to match `apiClient.ts`. MCP tool responses use `{success, message, data}` per spec (separate layer).
- Existing PUT upserts remain for the current frontend; new `/api/v1` uses RESTful verbs with the same envelope.
- Words remain English-first (`language` defaults `en`); game compatibility per §4.
- Design: monochrome + Electric Cyan `#06B6D4`, Inter body / Manrope headings, dark default + light, no em dashes in UI copy, preserve 8 locales + RTL.
- Reuse `audit_logs` for content + MCP audit; reuse `requireAdmin` for admin endpoints; reuse repositories/business rules for MCP writes.

## 11. Schema migration proposal (requires approval before applying)

New fields/collections are PROPOSED, not applied. A dedicated proposal + idempotent dry-run script will accompany Phase 1 (`docs/CONTENT_SCHEMA_MIGRATION_PROPOSAL.md`). Summary:
- blog_posts: add `tags` (string array). `archived` needs no change.
- custom_words: add `language` str(8) default `en`, `hint` str(255), `normalizedWord` str(64) + unique index for case-insensitive dedupe, `createdAt`/`updatedAt` str(64).
- New `word_categories` collection (configurable word categories) — or reuse free-text category with a managed list; decision in proposal.
- New `mcp_api_keys` collection: id, name, keyHash, keyPrefix, scopes[], createdAt, expiresAt, lastUsedAt, revokedAt, createdBy, status.
Code will target the post-migration schema with graceful fallbacks so it builds and unit-tests offline before the migration is approved/applied.

## 12. Implementation plan and risks

Order: Phase 0 audit (this) → migration proposal + script → backend content services (blog/word) + CSV + import/export → /api/v1 + public API → MCP server + keys + tools → frontend admin upgrades + MCP page → examples + docs → tests + security review → final report.
Risks: (a) schema migrations need explicit approval and live verification; (b) MCP SDK is a new dependency required by the spec; (c) Appwrite has no multi-row transactions — import uses safe batching + per-record reporting + idempotency, not claimed atomicity; (d) in-memory rate limiting is not multi-process safe (documented); (e) `read("any")` on content tables is a pre-existing exposure handled by API filtering, with permission hardening proposed separately.